'use client';

import { useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronDown,
  Code2,
  Copy,
  Layers3,
  LifeBuoy,
  Menu,
  MessageCircle,
  PackageCheck,
  Radar,
  ShieldCheck,
  Sparkles,
  Truck,
  X,
  Zap,
} from 'lucide-react';

const steps = [
  { number: '01', title: 'Connect', text: 'Plug in a Shopify webhook or install dz-tracking-sdk with one line of code.', icon: Code2 },
  { number: '02', title: 'Auto-track', text: 'Orders and carrier updates sync automatically without changing your workflow.', icon: Radar },
  { number: '03', title: 'Delight shoppers', text: 'Give customers a branded tracking page with live, proactive updates.', icon: PackageCheck },
];

const faqs = [
  ['How long does setup take?', 'Most stores are live in under 10 minutes. Connect your store, choose your carriers, and copy the tracking link into your post-purchase flow.'],
  ['Does it work with Shopify?', 'Yes. DZ Tracking connects through Shopify webhooks and works alongside your existing checkout, fulfillment, and support tools.'],
  ['Which couriers are supported?', 'Yalidine and EcoTrack are supported out of the box, with an adapter layer for 80+ regional and international carriers.'],
  ['How is customer data protected?', 'We only process the data needed to deliver tracking updates, use encrypted connections, and keep your store data isolated.'],
];

function TrackingPreview() {
  return (
    <div className="tracking-preview">
      <div className="preview-topbar"><span className="window-dot red" /><span className="window-dot yellow" /><span className="window-dot green" /><span className="preview-url">app.dztracking.io/order/ZX-2048</span><span className="live-label"><i /> Live</span></div>
      <div className="preview-body">
        <div className="preview-mobile">
          <div className="phone-head"><span className="mini-logo"><i /> DZ Tracking</span><span className="phone-menu">•••</span></div>
          <div className="order-state"><span className="state-check"><Check /></span><div><small>ORDER ZX-2048</small><strong>Out for delivery</strong></div></div>
          <div className="eta"><span>Estimated arrival</span><strong>Today, 2:00 – 5:00 PM</strong></div>
          <div className="timeline">
            {[['Order confirmed', 'Mar 12, 9:32 AM', true], ['Picked up by Yalidine', 'Mar 12, 2:14 PM', true], ['At local hub · Algiers', 'Today, 8:41 AM', true], ['Out for delivery', 'Happening now', true]].map(([title, time, active], index) => <div className={`timeline-item ${active ? 'done' : ''}`} key={title as string}><span className="timeline-dot">{index < 3 ? <Check /> : <Truck />}</span><div><strong>{title}</strong><small>{time}</small></div></div>)}
          </div>
          <button className="whatsapp-button"><MessageCircle /> Get updates on WhatsApp</button>
        </div>
        <div className="payload-panel"><div className="payload-heading"><span>POST /v1/webhooks/carrier</span><button aria-label="Copy payload"><Copy /></button></div><pre><code><span className="code-purple">{'{'}</span>{'\n'}  <span className="code-blue">"event"</span>: <span className="code-green">"shipment.updated"</span>,{ '\n' }  <span className="code-blue">"order_id"</span>: <span className="code-green">"ZX-2048"</span>,{ '\n' }  <span className="code-blue">"status"</span>: <span className="code-green">"out_for_delivery"</span>,{ '\n' }  <span className="code-blue">"carrier"</span>: <span className="code-green">"yalidine"</span>,{ '\n' }  <span className="code-blue">"updated_at"</span>: <span className="code-green">"2026-03-13T08:41Z"</span>{'\n'}<span className="code-purple">{'}'}</span></code></pre><div className="payload-status"><span className="status-dot" /> 200 OK <span>42ms</span></div></div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('Developers');
  const [orders, setOrders] = useState(1200);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const saved = Math.round(orders * 0.15 * 28);

  return <main>
    <nav className="nav container"><a className="brand" href="#top"><span className="brand-mark"><i /></span><span>DZ Tracking</span></a><div className={`nav-links ${menuOpen ? 'open' : ''}`}><a href="#features">Features</a><a href="#integrations">Integrations</a><a href="#developers">Developers</a><a href="#pricing">Pricing</a><a href="/login">Login</a></div><div className="nav-actions"><a className="login-link" href="/login">Log in</a><a className="button button-dark button-small" href="#pricing">Get started free <ArrowRight /></a><button className="menu-button" aria-label="Toggle navigation" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button></div></nav>

    <section className="hero container" id="top"><div className="hero-copy"><div className="eyebrow"><span className="eyebrow-icon"><Zap /></span> Next-gen post-purchase infrastructure</div><h1>Turn “Where is my order?” into <em>automated revenue.</em></h1><p className="hero-sub">An independent order tracking layer for Shopify, custom React stores, and 80+ couriers. Self-service tracking via web links and automated WhatsApp alerts.</p><div className="hero-actions"><a className="button button-primary" href="#pricing">Start free trial <ArrowRight /></a><a className="button button-outline" href="#developers"><Code2 /> View developer docs</a></div><div className="hero-note"><span className="avatar-stack"><i /><i /><i /></span><span>Join 240+ stores reducing COD returns</span><span className="stars">★★★★★</span></div></div><div className="hero-visual"><div className="glow-orb" /><TrackingPreview /></div></section>

    <section className="trust-bar"><div className="container trust-inner"><span className="trust-label">Trusted by e-commerce teams integrated with</span><div className="trust-logos"><strong>◈ shopify</strong><strong>YALIDINE <small>EXPRESS</small></strong><strong><span className="eco-mark">◒</span> EcoTrack</strong><strong>Woo</strong><strong className="sdk-logo">&lt;/&gt; Custom SDK</strong></div></div></section>

    <section className="section problem-section"><div className="container two-col"><div><div className="section-kicker">THE COD NIGHTMARE</div><h2>Every unanswered question costs you a sale.</h2><p className="section-lead">COD markets move fast. When customers cannot see what is happening, they stop answering calls, packages come back, and your team gets stuck doing detective work.</p><a className="text-link" href="#features">See how DZ Tracking helps <ArrowRight /></a></div><div className="problem-cards"><div className="problem-card"><span className="problem-icon red-icon"><MessageCircle /></span><div><strong>“أين طلبي؟”</strong><p>Support teams spend hours answering the same delivery question.</p></div><span className="problem-stat">+38%</span></div><div className="problem-card"><span className="problem-icon orange-icon"><PackageCheck /></span><div><strong>Retours eat your margin</strong><p>Failed deliveries turn paid acquisition into a total loss.</p></div><span className="problem-stat">−15%</span></div><div className="problem-card"><span className="problem-icon blue-icon"><Layers3 /></span><div><strong>Scattered tracking</strong><p>Generic courier links break trust and lose your branding.</p></div><span className="problem-stat">4 tools</span></div></div></div></section>

    <section className="section light-section" id="integrations"><div className="container"><div className="center-heading"><div className="section-kicker">SIMPLE BY DESIGN</div><h2>From order placed to doorbell.</h2><p>One reliable layer between your store, your carriers, and every shopper.</p></div><div className="steps-grid">{steps.map(({ number, title, text, icon: Icon }) => <div className="step" key={number}><span className="step-number">{number}</span><div className="step-icon"><Icon /></div><h3>{title}</h3><p>{text}</p></div>)}</div></div></section>

    <section className="section" id="features"><div className="container"><div className="section-heading-row"><div><div className="section-kicker">BUILT FOR THE REGION</div><h2>Infrastructure that thinks<br /><em>like your business.</em></h2></div><p>Powerful enough for developers. Simple enough for every operations team.</p></div><div className="bento-grid"><div className="bento-card bento-large"><div className="bento-icon"><Layers3 /></div><h3>Unified multi-carrier layer</h3><p>One dashboard for Shopify, Yalidine, EcoTrack, and every carrier your store needs.</p><div className="carrier-pills"><span>Shopify</span><span>Yalidine</span><span>EcoTrack</span><span>+ 80 more</span></div></div><div className="bento-card bento-dark"><div className="bento-icon"><ShieldCheck /></div><h3>Algerian logistics intelligence</h3><p>Catch “Client ne répond pas” and Stopdesk arrivals before they become retours.</p><div className="alert-row"><span className="alert-dot" /><span>Action recommended</span><strong>Notify customer</strong></div></div><div className="bento-card"><div className="bento-icon"><Code2 /></div><h3>Developer-first SDK</h3><p>Auto-capture forms with one line or use clean, typed APIs built for your stack.</p><code className="inline-code">trackAndRedirect({'{ orderId }'})</code></div><div className="bento-card"><div className="bento-icon"><Sparkles /></div><h3>White-label by default</h3><p>Your colors, your store name, your customer relationship.</p><div className="brand-preview"><span className="brand-preview-dot" /><b>Acme Store</b><span>Tracking</span></div></div></div></div></section>

    <section className="section showcase-section" id="developers"><div className="container"><div className="center-heading"><div className="section-kicker">ONE PLATFORM, THREE VIEWS</div><h2>Everyone sees what matters.</h2><p>Give your team, your developers, and your shoppers a better experience.</p></div><div className="showcase"><div className="tab-list">{['Developers', 'Merchants', 'Shoppers'].map(tab => <button key={tab} className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>{tab}{activeTab === tab && <ArrowRight />}</button>)}</div><div className="tab-panel">{activeTab === 'Developers' && <><div className="tab-copy"><span className="tab-label">FOR DEVELOPERS</span><h3>Ship tracking, not tracking infrastructure.</h3><p>A tiny SDK that turns your existing order confirmation into a branded tracking journey.</p><a className="text-link" href="#pricing">Read the docs <ArrowRight /></a></div><div className="code-window"><div className="code-window-head"><span><i /><i /><i /></span><small>checkout.tsx</small></div><pre><code><span className="code-purple">import</span> {'{ '}<span className="code-blue">trackAndRedirect</span>{' } '}<span className="code-purple">from</span> <span className="code-green">'@dz-tracking/sdk'</span>{'\n\n'}<span className="code-purple">function</span> <span className="code-blue">OrderSuccess</span>() {'{'}{'\n'}  <span className="code-purple">return</span> ({'\n'}    &lt;<span className="code-blue">button</span>{'\n'}      <span className="code-orange">onClick</span>={'{'}() =&gt; <span className="code-blue">trackAndRedirect</span>({'{'}{'\n'}        orderId, name, phone{'}'}){'}'}{'\n'}    &gt;{'\n'}      Track my order{'\n'}    &lt;/<span className="code-blue">button</span>&gt;{'\n'}  ){ '\n' }{'}'}</code></pre></div></>}{activeTab === 'Merchants' && <><div className="tab-copy"><span className="tab-label">FOR MERCHANTS</span><h3>Your operations, one calm dashboard.</h3><p>Map carrier statuses, filter at-risk orders, and know what needs attention before your customers do.</p><a className="text-link" href="#pricing">Explore dashboard <ArrowRight /></a></div><div className="merchant-window"><div className="merchant-head"><b>Orders</b><span>Last 30 days · <strong>1,284</strong></span></div>{['Out for delivery', 'At local hub', 'Client ne répond pas'].map((item, index) => <div className="merchant-row" key={item}><span className={`row-status status-${index}`} /><b>{item}</b><span>{[428, 196, 24][index]} orders</span><ArrowRight /></div>)}</div></>}{activeTab === 'Shoppers' && <><div className="tab-copy"><span className="tab-label">FOR SHOPPERS</span><h3>A tracking experience worth opening.</h3><p>Branded, mobile-first updates keep customers informed and reduce “where is my order?” messages.</p><a className="text-link" href="#pricing">See live tracking <ArrowRight /></a></div><div className="shopper-window"><div className="shopper-header"><span className="mini-logo"><i /> DZ Tracking</span><span>Order #ZX-2048</span></div><div className="shopper-progress"><span className="progress-line" /><span className="progress-step active"><Check /></span><span className="progress-step active"><Check /></span><span className="progress-step active"><Truck /></span><span className="progress-step" /></div><div className="shopper-labels"><span>Confirmed</span><span>In transit</span><span>Out for delivery</span><span>Delivered</span></div><div className="shopper-eta"><span>Arriving today</span><b>2:00 – 5:00 PM</b></div></div></>}</div></div></div></section>

    <section className="section calculator-section"><div className="container calculator"><div><div className="section-kicker">THE ROI IS EASY TO SEE</div><h2>Stop losing money to<br /><em>preventable returns.</em></h2><p>See how much revenue proactive tracking could save your store every month.</p></div><div className="calculator-card"><div className="calc-top"><span>Monthly orders</span><strong>{orders.toLocaleString()}</strong></div><input type="range" min="100" max="10000" step="100" value={orders} onChange={e => setOrders(Number(e.target.value))} /><div className="range-labels"><span>100</span><span>10,000+</span></div><div className="calc-result"><span>Estimated saved revenue</span><strong>${saved.toLocaleString()}<small>/ month</small></strong><span className="calc-badge"><Check /> 15% fewer returns</span></div></div></div></section>

    <section className="section pricing-section" id="pricing"><div className="container"><div className="center-heading"><div className="section-kicker">SIMPLE, HONEST PRICING</div><h2>Start free. Scale when you&apos;re ready.</h2><p>No setup fees. No long-term contracts. Just fewer returns.</p></div><div className="pricing-grid"><div className="price-card"><span className="price-label">FREE</span><h3>Get moving</h3><p>For new stores validating their post-purchase flow.</p><div className="price"><strong>$0</strong><span>/ month</span></div><a className="button button-outline full-button" href="#top">Start for free <ArrowRight /></a><ul><li><Check /> Up to 50 orders / month</li><li><Check /> Branded tracking page</li><li><Check /> Shopify integration</li><li><Check /> Email support</li></ul></div><div className="price-card popular"><span className="popular-badge">MOST POPULAR</span><span className="price-label">PRO</span><h3>Grow with confidence</h3><p>For ambitious stores ready to automate retention.</p><div className="price"><strong>$29</strong><span>/ month</span></div><a className="button button-primary full-button" href="#top">Start free trial <ArrowRight /></a><ul><li><Check /> Unlimited orders</li><li><Check /> WhatsApp automation</li><li><Check /> Multi-carrier sync</li><li><Check /> COD intelligence alerts</li></ul></div></div></div></section>

    <section className="section faq-section"><div className="container faq-wrap"><div><div className="section-kicker">QUESTIONS, ANSWERED</div><h2>Everything you need<br />to get started.</h2><p>Still curious? <a href="mailto:hello@dztracking.io">Talk to our team.</a></p></div><div className="faq-list">{faqs.map(([question, answer], index) => <div className={`faq-item ${openFaq === index ? 'open' : ''}`} key={question}><button onClick={() => setOpenFaq(openFaq === index ? null : index)}><span>{question}</span><ChevronDown /></button>{openFaq === index && <p>{answer}</p>}</div>)}</div></div></section>

    <footer><div className="container footer-top"><a className="brand" href="#top"><span className="brand-mark"><i /></span><span>DZ Tracking</span></a><div className="footer-links"><div><b>Product</b><a href="#features">Features</a><a href="#pricing">Pricing</a><a href="#developers">SDK</a></div><div><b>Company</b><a href="#top">About</a><a href="mailto:hello@dztracking.io">Contact</a><a href="/login">Login</a></div><div><b>Resources</b><a href="#developers">Documentation</a><a href="#integrations">Integrations</a><a href="#top">Status</a></div></div></div><div className="container footer-bottom"><span>© 2026 DZ Tracking. Built for modern commerce in MENA.</span><span className="system-status"><i /> All systems operational</span></div></footer>
  </main>;
}
