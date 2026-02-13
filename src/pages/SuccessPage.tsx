import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import './SuccessPage.css';

interface PageState {
  email: string;
  loading: boolean;
  error?: string;
}

export const SuccessPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<PageState>({
    email: '',
    loading: true,
    error: undefined
  });

  useEffect(() => {
    try {
      const emailParam = searchParams.get('email');
      if (emailParam) {
        const decodedEmail = decodeURIComponent(emailParam);
        // Basic email validation
        if (decodedEmail.includes('@') && decodedEmail.includes('.')) {
          setState(prev => ({ ...prev, email: decodedEmail, loading: false }));
        } else {
          setState(prev => ({ ...prev, email: decodedEmail, loading: false, error: 'Invalid email format' }));
        }
      } else {
        setState(prev => ({ ...prev, loading: false }));
      }
    } catch (err) {
      setState(prev => ({ ...prev, loading: false, error: 'Failed to load email' }));
    }
  }, [searchParams]);

  const handleViewSubscription = () => {
    try {
      window.location.href = '/account/billing';
    } catch (err) {
      console.error('Navigation error:', err);
      alert('Failed to navigate to billing');
    }
  };

  const handleBookAppointment = () => {
    try {
      // Replace with your Calendly or booking link
      window.open('https://calendly.com/your-link', '_blank');
    } catch (err) {
      console.error('Failed to open booking link:', err);
      alert('Failed to open booking link');
    }
  };

  const handleDownloadApp = () => {
    try {
      alert('Download Options:\n\n📱 iOS: https://apps.apple.com/...\n🤖 Android: https://play.google.com/...');
    } catch (err) {
      console.error('Failed to show download options:', err);
    }
  };

  const handleWhatsApp = () => {
    try {
      if (!state.email || !state.email.includes('@')) {
        alert('Email address is not available. Please try refreshing the page.');
        return;
      }
      const message = `Hi! I just purchased and have a question. My email is: ${state.email}`;
      const whatsappURL = `https://wa.me/27671234567?text=${encodeURIComponent(message)}`;
      window.open(whatsappURL, '_blank');
    } catch (err) {
      console.error('Failed to open WhatsApp:', err);
      alert('Failed to open WhatsApp. Please try again.');
    }
  };

  return (
    <div className="success-page">
      {/* Header */}
      <header className="success-header">
        <div className="logo-section">
          <div className="logo">🎉</div>
        </div>
        <div className="header-text">
          <h1>Thank You!</h1>
          <h2>Let's Get Started</h2>
          {state.email && !state.error && (
            <p className="email-confirmation">
              Confirmation sent to: <strong>{state.email}</strong>
            </p>
          )}
          {state.error && (
            <p className="email-error">⚠️ {state.error}</p>
          )}
        </div>
        <div className="header-accent">
          <div className="accent-dot"></div>
        </div>
      </header>

      {/* Bento Grid */}
      <main className="success-main">
        <div className="bento-grid">
          {/* Block 1: View Subscription */}
          <button 
            className="bento-block block-1" 
            onClick={handleViewSubscription}
            aria-label="View subscription details"
            type="button"
          >
            <div className="block-content">
              <div className="block-icon" aria-hidden="true">💳</div>
              <h3>View Subscription</h3>
              <p>Check your plan & billing</p>
              <span className="block-btn">View Details →</span>
            </div>
          </button>

          {/* Block 2: Onboarding */}
          <button 
            className="bento-block block-2" 
            onClick={handleBookAppointment}
            aria-label="Book onboarding session"
            type="button"
          >
            <div className="block-content">
              <div className="block-icon" aria-hidden="true">📅</div>
              <h3>Book Onboarding</h3>
              <p>1-hour session to get started</p>
              <span className="block-btn">Schedule Now →</span>
            </div>
          </button>

          {/* Block 3: Download App */}
          <button 
            className="bento-block block-3" 
            onClick={handleDownloadApp}
            aria-label="Download the app"
            type="button"
          >
            <div className="block-content">
              <div className="block-icon" aria-hidden="true">📱</div>
              <h3>Get the App</h3>
              <p>iOS • Android • Web</p>
              <span className="block-btn">Download →</span>
            </div>
          </button>
        </div>
      </main>

      {/* WhatsApp Footer */}
      <footer className="success-footer">
        <button 
          className="whatsapp-contact" 
          onClick={handleWhatsApp}
          aria-label="Contact us via WhatsApp"
          type="button"
          disabled={state.loading || !state.email}
        >
          <span className="whatsapp-icon" aria-hidden="true">💬</span>
          <span className="whatsapp-text">WhatsApp Contact - Questions? Chat with us!</span>
        </button>
      </footer>

      {/* Email Notice */}
      <section className="email-notice">
        <p>📧 Check your email for your receipt and onboarding information</p>
      </section>
    </div>
  );
};
