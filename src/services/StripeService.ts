
// src/services/StripeService.ts
// Simplified Stripe integration - Creates payment links with Firebase UID metadata
// RevenueCat handles all webhook processing directly from Stripe

import Stripe from 'stripe';
import { CONFIG } from '../config';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()],
});

export class StripeService {
  private stripe: Stripe;
  private webhookSecret?: string;

  constructor() {
    // Use test key in development, live key in production
    const apiKey = CONFIG.NODE_ENV === 'production'
      ? CONFIG.STRIPE_SECRET_KEY_LIVE
      : CONFIG.STRIPE_SECRET_KEY_TEST;
    
    if (!apiKey) {
      logger.error('CRITICAL: STRIPE_SECRET_KEY environment variable is not set');
      throw new Error('STRIPE_SECRET_KEY is required');
    }

    this.stripe = new Stripe(apiKey, {
      apiVersion: '2023-10-16',
    });

    this.webhookSecret = CONFIG.STRIPE_WEBHOOK_SECRET;

    logger.info('Stripe service initialized', {
      mode: CONFIG.NODE_ENV === 'production' ? 'LIVE' : 'TEST'
    });
  }

  /**
   * Create a payment link for a specific user
   * The metadata contains the Firebase UID which RevenueCat reads automatically
   * 
   * Flow:
   * 1. User requests payment link from your backend
   * 2. Backend creates Stripe payment link with revenuecat_user_id in metadata
   * 3. User completes payment on Stripe
   * 4. Stripe sends webhook directly to RevenueCat (NOT your backend)
   * 5. RevenueCat reads metadata, grants entitlement
   * 6. Frontend checks RevenueCat SDK → premium unlocked
   */
  async createPaymentLinkForUser(
    firebaseUid: string,
    email: string
  ): Promise<string> {
    try {
      if (!CONFIG.STRIPE_PRICE_ID) {
        throw new Error('STRIPE_PRICE_ID is not configured');
      }

      if (!CONFIG.APP_SUCCESS_URL) {
        throw new Error('APP_SUCCESS_URL is not configured');
      }

      const subscriptionData: Stripe.PaymentLinkCreateParams.SubscriptionData = {
        metadata: {
          revenuecat_user_id: firebaseUid, // ← RevenueCat reads this key
        },
      };

      const paymentLink = await this.stripe.paymentLinks.create({
        line_items: [
          {
            price: CONFIG.STRIPE_PRICE_ID,
            quantity: 1,
          }
        ],
        after_completion: {
          type: 'redirect',
          redirect: {
            url: CONFIG.APP_SUCCESS_URL
          }
        },
        subscription_data: subscriptionData,
      });

      // Pre-fill email in payment form for better UX
      const urlWithEmail = `${paymentLink.url}?prefilled_email=${encodeURIComponent(email)}`;
      
      logger.info('Payment link created', {
        firebaseUid,
        email,
        paymentLinkId: paymentLink.id
      });

      return urlWithEmail;
    } catch (error: any) {
      logger.error('Failed to create payment link', {
        firebaseUid,
        email,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Verify webhook signature for security (optional - for audit logging)
   * Note: Main webhooks go directly to RevenueCat, not your backend
   */
  verifyWebhookSignature(
    rawBody: string | Buffer,
    signature: string
  ): Stripe.Event | null {
    if (!this.webhookSecret) {
      logger.warn('Webhook signature verification disabled - STRIPE_WEBHOOK_SECRET not configured');
      // Parse body without verification (not recommended for production)
      return JSON.parse(typeof rawBody === 'string' ? rawBody : rawBody.toString());
    }

    try {
      const event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.webhookSecret
      );
      return event;
    } catch (error: any) {
      logger.error('Webhook signature verification failed', {
        error: error.message
      });
      return null;
    }
  }

  /**
   * Create a payment link with arbitrary metadata (for public/landing page)
   */
  async createPaymentLinkWithMetadata(
    userId: string,
    email: string,
    source: string = 'landing_page'
  ): Promise<string> {
    try {
      if (!CONFIG.STRIPE_PRICE_ID) {
        throw new Error('STRIPE_PRICE_ID is not configured');
      }
      if (!CONFIG.APP_SUCCESS_URL) {
        throw new Error('APP_SUCCESS_URL is not configured');
      }
      const subscriptionData: Stripe.PaymentLinkCreateParams.SubscriptionData = {
        metadata: {
          revenuecat_user_id: userId,
          user_email: email,
          source,
        },
      };
      const paymentLink = await this.stripe.paymentLinks.create({
        line_items: [
          {
            price: CONFIG.STRIPE_PRICE_ID,
            quantity: 1,
          }
        ],
        after_completion: {
          type: 'redirect',
          redirect: {
            url: `${CONFIG.APP_SUCCESS_URL}?email=${encodeURIComponent(email)}`
          }
        },
        subscription_data: subscriptionData,
      });
      // Pre-fill email in payment form for better UX
      const urlWithEmail = `${paymentLink.url}?prefilled_email=${encodeURIComponent(email)}`;
      logger.info('Public payment link created', {
        userId,
        email,
        source,
        paymentLinkId: paymentLink.id
      });
      return urlWithEmail;
    } catch (error: any) {
      logger.error('Failed to create public payment link', {
        userId,
        email,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get a customer by email (useful for debugging)
   */
  async getCustomerByEmail(email: string): Promise<Stripe.Customer | null> {
    try {
      const customers = await this.stripe.customers.list({
        email,
        limit: 1
      });

      return customers.data[0] || null;
    } catch (error: any) {
      logger.error('Failed to get Stripe customer', {
        email,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Get subscription by ID (useful for debugging)
   */
  async getSubscription(subscriptionId: string): Promise<Stripe.Subscription | null> {
    try {
      return await this.stripe.subscriptions.retrieve(subscriptionId);
    } catch (error: any) {
      logger.error('Failed to get Stripe subscription', {
        subscriptionId,
        error: error.message
      });
      return null;
    }
  }

  // Extract subscription data helper method
  extractSubscriptionData(subscription: Stripe.Subscription) {
    const items = subscription.items.data || [];
    const item = items[0];
    const price = item?.price as Stripe.Price | undefined;
    
    return {
      stripeProductId: price?.product as string || '',
      stripePriceId: item?.price?.id as string || '',
      quantity: item?.quantity || 1,
      status: subscription.status,
      currentPeriodStart: subscription.current_period_start,
      currentPeriodEnd: subscription.current_period_end,
      amountPaid: (subscription.items.data[0]?.price?.unit_amount || 0) / 100,
      currency: price?.currency || 'usd',
    };
  }

  // Map Stripe product to entitlement ID helper method
  mapProductToEntitlement(stripeProductId: string): string {
    // Map Stripe product IDs to internal entitlement IDs
    // This is a simple mapping - extend as needed for your products
    const productMap: { [key: string]: string } = {
      'prod_premium': 'entitlement_premium',
      'prod_pro': 'entitlement_pro',
      'prod_basic': 'entitlement_basic',
    };
    
    return productMap[stripeProductId] || `entitlement_${stripeProductId}`;
  }
}

export const stripeService = new StripeService();
