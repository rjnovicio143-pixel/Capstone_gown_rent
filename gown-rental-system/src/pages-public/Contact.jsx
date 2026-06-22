import React, { useState } from 'react';
import { Mail, Phone, MapPin, Send, Clock } from 'lucide-react';
import '../styles-public/ContactUs.css';

const ContactUs = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // Handing over form values to email or backend service
    alert(`Thank you, ${formData.name}! Your message has been sent successfully.`);
    setFormData({ name: '', email: '', subject: '', message: '' });
  };

  return (
    <div className="contact-page-container">
      {/* Header */}
      <div className="contact-header">
        <span className="contact-gold-badge"><Mail size={14} /> Get In Touch</span>
        <h2>Contact Us</h2>
        <p>Have questions about bookings, sizes, or rental rates? Drop us a line and we'll reply shortly!</p>
      </div>

      <div className="contact-grid">
        
        {/* Contact Information Panel */}
        <div className="contact-info-panel">
          <h3>Store Information</h3>
          <p className="info-intro">Visit our boutique showroom to browse and fit our collections in person.</p>
          
          <div className="info-details-list">
            <div className="info-item">
              <div className="info-icon">
                <MapPin size={20} />
              </div>
              <div className="info-text">
                <h4>Address</h4>
                <p>123 Golden Avenue, Poblacion, Talisay City, Cebu, Philippines</p>
              </div>
            </div>

            <div className="info-item">
              <div className="info-icon">
                <Phone size={20} />
              </div>
              <div className="info-text">
                <h4>Phone & Mobile</h4>
                <p>+63 (917) 123-4567<br />(032) 491-7890</p>
              </div>
            </div>

            <div className="info-item">
              <div className="info-icon">
                <Mail size={20} />
              </div>
              <div className="info-text">
                <h4>Email Address</h4>
                <p>support@mrsggownclinic.com</p>
              </div>
            </div>

            <div className="info-item">
              <div className="info-icon">
                <Clock size={20} />
              </div>
              <div className="info-text">
                <h4>Store Hours</h4>
                <p>Monday - Saturday: 9:00 AM - 6:00 PM<br />Sunday: By Appointment Only</p>
              </div>
            </div>
          </div>
        </div>

        {/* Message Input Form */}
        <div className="contact-form-panel">
          <h3>Send Us a Message</h3>
          <form onSubmit={handleSubmit} className="contact-inputs-form">
            <div className="form-group-split">
              <div className="form-input-control">
                <label>Full Name</label>
                <input 
                  type="text" 
                  name="name" 
                  value={formData.name} 
                  onChange={handleChange} 
                  placeholder="John Doe" 
                  required 
                />
              </div>
              <div className="form-input-control">
                <label>Email Address</label>
                <input 
                  type="email" 
                  name="email" 
                  value={formData.email} 
                  onChange={handleChange} 
                  placeholder="johndoe@example.com" 
                  required 
                />
              </div>
            </div>

            <div className="form-input-control">
              <label>Subject</label>
              <input 
                type="text" 
                name="subject" 
                value={formData.subject} 
                onChange={handleChange} 
                placeholder="Rental Inquiry" 
                required 
              />
            </div>

            <div className="form-input-control">
              <label>Message</label>
              <textarea 
                name="message" 
                value={formData.message} 
                onChange={handleChange} 
                rows="5" 
                placeholder="Write your details here..." 
                required
              ></textarea>
            </div>

            <button type="submit" className="contact-submit-btn">
              <Send size={16} />
              <span>Send Message</span>
            </button>
          </form>
        </div>

      </div>
    </div>
  );
};

export default ContactUs;