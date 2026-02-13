// src/services/SubscriptionService.ts
// Orchestrates subscription flow: Stripe → Database → RevenueCat

import { neon } from '@neondatabase/serverless';
import { CONFIG } from '../config';
import { stripeService } from './StripeService';
import { revenueCatService } from './RevenueCatService';
import { v4 as uuidv4 } from 'uuid';
import Stripe from 'stripe';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()],
});

const sql = neon(CONFIG.DATABASE_URL!);

export interface UserSubscription {
  userId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  status: 'active' | 'past_due' | 'canceled' | 'trialing';
  currentPeriodEnd: Date;
  entitlementId: string;
}

export class SubscriptionService {
  /**
   * Record Stripe webhook event in database (audit trail)
   */
  async recordWebhookEvent(
    eventType: string,
    eventData: any,
    stripeEventId: string,
    userId?: string,
    stripeCustomerId?: string,
    stripeSubscriptionId?: string
  ): Promise<void> {
    try {
      await sql`
        INSERT INTO stripe_webhook_events (
          id,
          stripe_event_id,
          event_type,
          user_id,
          stripe_customer_id,
          stripe_subscription_id,
          payload,
          processed
        ) VALUES (
          ${uuidv4()},
          ${stripeEventId},
          ${eventType},
          ${userId || null},
          ${stripeCustomerId || null},
          ${stripeSubscriptionId || null},
          ${JSON.stringify(eventData)},
          false
        )
      `;

      logger.info('Webhook event recorded', {
        eventType,
        stripeEventId,
        userId
      });
    } catch (error: any) {
      logger.error('Failed to record webhook event', {
        eventType,
        stripeEventId,
        error: error.message
      });
    }
  }

  /**
   * Handle customer.subscription.created event
   * New subscription detected - grant entitlements
   */
  async handleSubscriptionCreated(
    subscription: Stripe.Subscription,
    firebaseUid: string
  ): Promise<void> {
    try {
      const subscriptionData = stripeService.extractSubscriptionData(subscription);
      const stripeCustomerId = subscription.customer as string;
      const entitlementId = stripeService.mapProductToEntitlement(subscriptionData.stripeProductId);

      // 1. Create/update stripe_customers entry
      await sql`
        INSERT INTO stripe_customers (
          id,
          user_id,
          email,
          stripe_customer_id
        ) VALUES (
          ${uuidv4()},
          ${firebaseUid},
          ${(subscription.customer as any)?.email || 'unknown'},
          ${stripeCustomerId}
        )
        ON CONFLICT (user_id) DO UPDATE SET
          stripe_customer_id = EXCLUDED.stripe_customer_id,
          updated_at = NOW()
      `;

      // 2. Insert subscription record
      await sql`
        INSERT INTO subscriptions (
          id,
          user_id,
          stripe_customer_id,
          stripe_subscription_id,
          stripe_product_id,
          status,
          current_period_start,
          current_period_end,
          amount_paid,
          currency
        ) VALUES (
          ${uuidv4()},
          ${firebaseUid},
          ${stripeCustomerId},
          ${subscription.id},
          ${subscriptionData.stripeProductId},
          ${subscriptionData.status},
          ${subscriptionData.currentPeriodStart},
          ${subscriptionData.currentPeriodEnd},
          ${subscriptionData.amountPaid},
          ${subscriptionData.currency}
        )
        ON CONFLICT (stripe_subscription_id) DO UPDATE SET
          status = EXCLUDED.status,
          current_period_end = EXCLUDED.current_period_end,
          updated_at = NOW()
      `;

      // 3. Link Stripe customer to RevenueCat
      await revenueCatService.setStripeCustomerId(firebaseUid, stripeCustomerId);

      // 4. Grant entitlement in RevenueCat
      await revenueCatService.grantEntitlement(
        firebaseUid,
        entitlementId,
        new Date(subscriptionData.currentPeriodEnd * 1000)
      );

      // 5. Log sync event
      await this.logRevenueCatSync(firebaseUid, 'grant', entitlementId, true);

      logger.info('Subscription created and synced', {
        userId: firebaseUid,
        subscriptionId: subscription.id,
        entitlementId,
        status: subscriptionData.status
      });
    } catch (error: any) {
      logger.error('Failed to handle subscription creation', {
        firebaseUid,
        subscriptionId: subscription.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Handle customer.subscription.updated event
   * Subscription changed - update entitlements
   */
  async handleSubscriptionUpdated(
    subscription: Stripe.Subscription,
    firebaseUid: string
  ): Promise<void> {
    try {
      const subscriptionData = stripeService.extractSubscriptionData(subscription);
      const entitlementId = stripeService.mapProductToEntitlement(subscriptionData.stripeProductId);

      // Update subscription status
      await sql`
        UPDATE subscriptions 
        SET status = ${subscriptionData.status},
            current_period_end = ${subscriptionData.currentPeriodEnd},
            updated_at = NOW()
        WHERE stripe_subscription_id = ${subscription.id}
      `;

      // If status changed to past_due, still keep entitlement
      // If status is trialing, keep entitlement
      // If status is active, keep entitlement
      if (subscriptionData.status === 'active' || subscriptionData.status === 'trialing') {
        await revenueCatService.grantEntitlement(
          firebaseUid,
          entitlementId,
          new Date(subscriptionData.currentPeriodEnd * 1000)
        );
        await this.logRevenueCatSync(firebaseUid, 'update', entitlementId, true);
      }

      logger.info('Subscription updated and synced', {
        userId: firebaseUid,
        subscriptionId: subscription.id,
        status: subscriptionData.status
      });
    } catch (error: any) {
      logger.error('Failed to handle subscription update', {
        firebaseUid,
        subscriptionId: subscription.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Handle customer.subscription.deleted event
   * Subscription canceled - revoke entitlements
   */
  async handleSubscriptionDeleted(
    subscription: Stripe.Subscription,
    firebaseUid: string
  ): Promise<void> {
    try {
      const subscriptionData = stripeService.extractSubscriptionData(subscription);
      const entitlementId = stripeService.mapProductToEntitlement(subscriptionData.stripeProductId);

      // Mark as canceled in database
      await sql`
        UPDATE subscriptions 
        SET status = 'canceled',
            canceled_at = NOW(),
            updated_at = NOW()
        WHERE stripe_subscription_id = ${subscription.id}
      `;

      // Revoke entitlement in RevenueCat
      await revenueCatService.revokeEntitlement(firebaseUid, entitlementId);

      // Log sync event
      await this.logRevenueCatSync(firebaseUid, 'revoke', entitlementId, true);

      logger.info('Subscription deleted and revoked', {
        userId: firebaseUid,
        subscriptionId: subscription.id,
        entitlementId
      });
    } catch (error: any) {
      logger.error('Failed to handle subscription deletion', {
        firebaseUid,
        subscriptionId: subscription.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get user's current subscription
   */
  async getUserSubscription(firebaseUid: string): Promise<UserSubscription | null> {
    try {
      const subscriptions = await sql`
        SELECT 
          user_id,
          stripe_customer_id,
          stripe_subscription_id,
          stripe_product_id,
          status,
          current_period_end
        FROM subscriptions
        WHERE user_id = ${firebaseUid}
        AND status IN ('active', 'trialing', 'past_due')
        ORDER BY created_at DESC
        LIMIT 1
      `;

      if (!subscriptions[0]) return null;

      const sub = subscriptions[0];
      return {
        userId: sub.user_id,
        stripeCustomerId: sub.stripe_customer_id,
        stripeSubscriptionId: sub.stripe_subscription_id,
        status: sub.status,
        currentPeriodEnd: new Date(sub.current_period_end),
        entitlementId: stripeService.mapProductToEntitlement(sub.stripe_product_id)
      };
    } catch (error: any) {
      logger.error('Failed to get user subscription', {
        firebaseUid,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Check if user has active subscription
   */
  async isUserSubscribed(firebaseUid: string): Promise<boolean> {
    try {
      const subscription = await this.getUserSubscription(firebaseUid);
      return subscription !== null;
    } catch (error) {
      logger.error('Failed to check subscription status', { firebaseUid });
      return false;
    }
  }

  /**
   * Link user by email (used when processing webhook for new customers)
   */
  async linkUserByEmail(email: string, firebaseUid: string): Promise<void> {
    try {
      // Find stripe customer by email
      const stripeCustomer = await stripeService.getCustomerByEmail(email);
      if (!stripeCustomer) {
        logger.info('No Stripe customer found for email', { email });
        return;
      }

      // Create or update stripe_customers entry
      await sql`
        INSERT INTO stripe_customers (
          id,
          user_id,
          email,
          stripe_customer_id
        ) VALUES (
          ${uuidv4()},
          ${firebaseUid},
          ${email},
          ${stripeCustomer.id}
        )
        ON CONFLICT (user_id) DO UPDATE SET
          stripe_customer_id = EXCLUDED.stripe_customer_id,
          updated_at = NOW()
      `;

      logger.info('User linked to Stripe customer', {
        firebaseUid,
        email,
        stripeCustomerId: stripeCustomer.id
      });
    } catch (error: any) {
      logger.error('Failed to link user by email', {
        email,
        firebaseUid,
        error: error.message
      });
    }
  }

  /**
   * Log RevenueCat sync operations for audit trail
   */
  private async logRevenueCatSync(
    firebaseUid: string,
    action: 'grant' | 'revoke' | 'update',
    entitlementId: string,
    success: boolean,
    error?: string
  ): Promise<void> {
    try {
      await sql`
        INSERT INTO revenueCat_sync_log (
          id,
          user_id,
          action,
          entitlement_id,
          success,
          error,
          created_at
        ) VALUES (
          ${uuidv4()},
          ${firebaseUid},
          ${action},
          ${entitlementId},
          ${success},
          ${error || null},
          NOW()
        )
      `;
    } catch (error: any) {
      logger.error('Failed to log RevenueCat sync', {
        firebaseUid,
        entitlementId,
        error: error.message
      });
    }
  }
}

export const subscriptionService = new SubscriptionService();
