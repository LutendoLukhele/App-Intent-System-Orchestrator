// src/services/RevenueCatService.ts
// Manages entitlements and syncing with RevenueCat

import axios, { AxiosError } from 'axios';
import { CONFIG } from '../config';
import { v4 as uuidv4 } from 'uuid';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()],
});

export interface RevenueCatEntitlement {
  id: string;
  isActive: boolean;
  expiresAt?: Date;
}

export interface RevenueCatCustomer {
  id: string;
  subscriptions?: Record<string, any>;
  entitlements?: Record<string, RevenueCatEntitlement>;
}

export class RevenueCatService {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey?: string, baseUrl?: string) {
    this.apiKey = apiKey || CONFIG.REVENUCAT_API_KEY;
    this.baseUrl = baseUrl || 'https://api.revenuecat.com/v1';

    if (!this.apiKey) {
      logger.error('CRITICAL: REVENUCAT_API_KEY environment variable is not set');
      throw new Error('REVENUCAT_API_KEY is required');
    }
  }

  /**
   * Get customer data from RevenueCat
   * Includes subscriptions and entitlements
   */
  async getCustomer(appUserId: string): Promise<RevenueCatCustomer> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/customers/${appUserId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'X-Platform': 'web'
          }
        }
      );

      return response.data.customer || {};
    } catch (error: any) {
      logger.error('Failed to get RevenueCat customer', {
        appUserId,
        error: error.response?.data || error.message
      });
      throw error;
    }
  }

  /**
   * Grant an entitlement to a user
   * Called when Stripe payment is successful
   */
  async grantEntitlement(
    appUserId: string,
    entitlementId: string,
    expiresAt?: Date
  ): Promise<boolean> {
    try {
      const payload: any = {
        entitlements: [
          {
            id: entitlementId,
            is_active: true
          }
        ]
      };

      if (expiresAt) {
        payload.entitlements[0].expires_at = expiresAt.toISOString();
      }

      const response = await axios.post(
        `${this.baseUrl}/customers/${appUserId}/entitlements`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'X-Platform': 'web'
          }
        }
      );

      logger.info('Entitlement granted', {
        appUserId,
        entitlementId,
        expiresAt
      });

      return true;
    } catch (error: any) {
      logger.error('Failed to grant entitlement', {
        appUserId,
        entitlementId,
        error: error.response?.data || error.message
      });
      throw error;
    }
  }

  /**
   * Revoke an entitlement from a user
   * Called when subscription is canceled
   */
  async revokeEntitlement(
    appUserId: string,
    entitlementId: string
  ): Promise<boolean> {
    try {
      const payload = {
        entitlements: [
          {
            id: entitlementId,
            is_active: false
          }
        ]
      };

      await axios.post(
        `${this.baseUrl}/customers/${appUserId}/entitlements`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'X-Platform': 'web'
          }
        }
      );

      logger.info('Entitlement revoked', {
        appUserId,
        entitlementId
      });

      return true;
    } catch (error: any) {
      logger.error('Failed to revoke entitlement', {
        appUserId,
        entitlementId,
        error: error.response?.data || error.message
      });
      throw error;
    }
  }

  /**
   * Link a Stripe customer ID to RevenueCat app user ID
   * Stripe uses email, RevenueCat uses app user ID (Firebase UID)
   */
  async setStripeCustomerId(
    appUserId: string,
    stripeCustomerId: string
  ): Promise<boolean> {
    try {
      const payload = {
        stripe_customer_id: stripeCustomerId
      };

      await axios.post(
        `${this.baseUrl}/customers/${appUserId}`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'X-Platform': 'web'
          }
        }
      );

      logger.info('Stripe customer linked to RevenueCat', {
        appUserId,
        stripeCustomerId: stripeCustomerId.slice(0, 10) + '***'
      });

      return true;
    } catch (error: any) {
      logger.error('Failed to link Stripe customer', {
        appUserId,
        error: error.response?.data || error.message
      });
      throw error;
    }
  }

  /**
   * Check if user has active entitlement
   */
  async hasEntitlement(
    appUserId: string,
    entitlementId: string
  ): Promise<boolean> {
    try {
      const customer = await this.getCustomer(appUserId);
      const entitlement = customer.entitlements?.[entitlementId];
      return entitlement?.isActive || false;
    } catch (error) {
      logger.error('Failed to check entitlement', { appUserId, entitlementId });
      return false;
    }
  }

  /**
   * Get all active entitlements for a user
   */
  async getActiveEntitlements(appUserId: string): Promise<string[]> {
    try {
      const customer = await this.getCustomer(appUserId);
      if (!customer.entitlements) return [];

      return Object.keys(customer.entitlements)
        .filter(id => customer.entitlements![id].isActive);
    } catch (error) {
      logger.error('Failed to get active entitlements', { appUserId });
      return [];
    }
  }

  /**
   * Check if user has any active subscription
   */
  async isUserSubscribed(appUserId: string): Promise<boolean> {
    try {
      const activeEntitlements = await this.getActiveEntitlements(appUserId);
      return activeEntitlements.length > 0;
    } catch (error) {
      logger.error('Failed to check subscription status', { appUserId });
      return false;
    }
  }
}

export const revenueCatService = new RevenueCatService();
