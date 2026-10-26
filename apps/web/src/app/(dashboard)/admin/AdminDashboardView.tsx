'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  approvePayment,
  rejectPayment,
  manualUpdateSubscription,
  toggleMerchantStatus,
  regenerateApiKey,
  logout,
} from './actions';
import styles from './admin.module.css';
import SiteHeader from '../../SiteHeader';

interface MerchantItem {
  id: string;
  store_name: string;
  api_key: string;
  created_at: string;
  subscription_tier?: string | null;
  subscription_status?: string | null;
  max_orders_limit?: number | null;
  monthly_orders_used?: number | null;
  subscription_expires_at?: string | null;
}

interface OrderItem {
  id: string;
  merchant_id: string;
  external_order_id: string;
  customer_name: string | null;
  current_status: string;
  carrier_name: string | null;
  carrier_tracking_number: string | null;
  tracking_uuid: string;
  created_at: string;
  merchants?: { store_name: string } | { store_name: string }[] | null;
}

interface PaymentItem {
  id: string;
  merchant_id: string;
  plan_tier: string;
  amount_dzd: number;
  payment_method: string;
  payment_proof_url: string | null;
  transaction_ref: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
  reviewed_at: string | null;
  merchants?: { store_name: string } | { store_name: string }[] | null;
}

interface Props {
  userEmail: string;
  merchants: MerchantItem[];
  orders: OrderItem[];
  payments: PaymentItem[];
}

const Icons = {
  BarChart: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>,
  CreditCard: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>,
  Store: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>,
  Activity: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>,
  Settings: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>,
  Search: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>,
  LogOut: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>,
  User: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>,
  X: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
};

export function AdminDashboardView({
  userEmail,
  merchants,
  orders,
  payments,
}: Props) {
  const [activeTab, setActiveTab] = useState<'overview' | 'payments' | 'merchants' | 'telemetry' | 'settings'>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  useEffect(() => { setMobileMenuOpen(false); }, [activeTab]);
  const [searchQuery, setSearchQuery] = useState('');
  const [merchantFilter, setMerchantFilter] = useState<'all' | 'active' | 'expiring' | 'expired' | 'suspended'>('all');
  const [carrierFilter, setCarrierFilter] = useState<string>('all');
  
  const [editingMerchant, setEditingMerchant] = useState<MerchantItem | null>(null);
  const [editTier, setEditTier] = useState<string>('growth');
  const [editLimit, setEditLimit] = useState<number>(200);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const openEditModal = (m: MerchantItem) => {
    const t = m.subscription_tier || 'starter';
    const tierLimits: Record<string, number> = { starter: 30, basic: 100, growth: 200, scale: 999999 };
    const dLimit = tierLimits[t] || 30;
    setEditTier(t);
    setEditLimit(t === 'scale' ? 999999 : (m.max_orders_limit && m.max_orders_limit >= dLimit ? m.max_orders_limit : dLimit));
    setEditingMerchant(m);
  };

  // Pagination / Lazy Loading states
  const [visibleOrders, setVisibleOrders] = useState(20);
  const scrollRef = useRef<HTMLDivElement>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const mrrDzd = useMemo(() => {
    return merchants.reduce((sum, m) => {
      if (m.subscription_status === 'suspended') return sum;
      if (m.subscription_tier === 'scale') return sum + 2500;
      if (m.subscription_tier === 'growth') return sum + 1800;
      if (m.subscription_tier === 'basic') return sum + 1000;
      return sum;
    }, 0);
  }, [merchants]);

  const pendingPayments = useMemo(() => {
    return payments.filter((p) => p.status === 'pending');
  }, [payments]);

  const carrierDistribution = useMemo(() => {
    let yalidine = 0;
    let zr = 0;
    let eco = 0;
    let maystro = 0;
    let others = 0;

    orders.forEach((o) => {
      const name = (o.carrier_name || '').toLowerCase();
      if (name.includes('yalidine') || name.includes('guepex')) yalidine++;
      else if (name.includes('zr') || name.includes('procolis')) zr++;
      else if (name.includes('eco') || name.includes('conexlog') || name.includes('dhd')) eco++;
      else if (name.includes('maystro')) maystro++;
      else others++;
    });

    const total = orders.length || 1;
    return {
      yalidine: Math.round((yalidine / total) * 100),
      zr: Math.round((zr / total) * 100),
      eco: Math.round((eco / total) * 100),
      maystro: Math.round((maystro / total) * 100),
      others: Math.round((others / total) * 100),
      counts: { yalidine, zr, eco, maystro, others },
    };
  }, [orders]);

  const filteredMerchants = useMemo(() => {
    return merchants.filter((m) => {
      const matchSearch =
        m.store_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.api_key.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchSearch) return false;

      const now = new Date();
      const expiresAt = m.subscription_expires_at ? new Date(m.subscription_expires_at) : null;
      const daysLeft = expiresAt ? Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 3600 * 24)) : 0;

      if (merchantFilter === 'active') return m.subscription_status === 'active' && daysLeft > 0;
      if (merchantFilter === 'expiring') return m.subscription_status === 'active' && daysLeft > 0 && daysLeft <= 3;
      if (merchantFilter === 'expired') return m.subscription_status !== 'suspended' && (daysLeft <= 0 || m.subscription_status === 'expired');
      if (merchantFilter === 'suspended') return m.subscription_status === 'suspended';

      return true;
    });
  }, [merchants, searchQuery, merchantFilter]);

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (carrierFilter !== 'all') {
        const c = (o.carrier_name || '').toLowerCase();
        if (!c.includes(carrierFilter)) return false;
      }
      if (!searchQuery) return true;
      return (
        o.external_order_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (o.carrier_tracking_number || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (o.customer_name || '').toLowerCase().includes(searchQuery.toLowerCase())
      );
    });
  }, [orders, carrierFilter, searchQuery]);

  // Lazy loading observer logic
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleOrders((prev) => Math.min(prev + 20, filteredOrders.length));
        }
      },
      { threshold: 0.1 }
    );

    const sentinel = document.getElementById('scroll-sentinel');
    if (sentinel) observer.observe(sentinel);

    return () => {
      if (sentinel) observer.unobserve(sentinel);
    };
  }, [filteredOrders.length, activeTab]);

  const handleApprovePayment = async (paymentId: string) => {
    setIsSubmitting(true);
    const fd = new FormData();
    fd.append('payment_id', paymentId);
    const res = await approvePayment(fd);
    setIsSubmitting(false);
    if (res?.error) {
      alert(res.error);
    } else {
      showToast('تم قبول الوصل وتفعيل اشتراك المتجر بنجاح');
    }
  };

  const handleRejectPayment = async (paymentId: string) => {
    const reason = prompt('أدخل سبب رفض الوصل (سيظهر للتاجر):', 'تعذر مطابقة رقم العملية في الحساب');
    if (!reason) return;

    setIsSubmitting(true);
    const fd = new FormData();
    fd.append('payment_id', paymentId);
    fd.append('admin_notes', reason);
    const res = await rejectPayment(fd);
    setIsSubmitting(false);
    if (res?.error) {
      alert(res.error);
    } else {
      showToast('تم رفض الوصل وإشعار المتجر');
    }
  };

  const handleToggleStatus = async (m: MerchantItem) => {
    const next = m.subscription_status === 'suspended' ? 'تفعيل' : 'تجميد';
    if (!confirm(`هل أنت متأكد من ${next} حساب متجر "${m.store_name}"؟`)) return;

    const fd = new FormData();
    fd.append('merchant_id', m.id);
    fd.append('current_status', m.subscription_status || 'active');
    await toggleMerchantStatus(fd);
    showToast(`تم ${next} المتجر بنجاح`);
  };

  const handleRegenKey = async (m: MerchantItem) => {
    if (!confirm(`تحذير: سيتم إبطال المفتاح الحالي لمتجر "${m.store_name}" وتوليد مفتاح جديد. هل ترغب بالمتابعة؟`)) return;

    const fd = new FormData();
    fd.append('merchant_id', m.id);
    const res = await regenerateApiKey(fd);
    if (res?.success) {
      showToast(`تم توليد مفتاح جديد: ${res.newKey}`);
    }
  };

  const handleSaveManualEdit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingMerchant) return;

    setIsSubmitting(true);
    const fd = new FormData(e.currentTarget);
    fd.append('merchant_id', editingMerchant.id);
    const res = await manualUpdateSubscription(fd);
    setIsSubmitting(false);

    if (res?.error) {
      alert(res.error);
    } else {
      setEditingMerchant(null);
      showToast('تم تحديث اشتراك المتجر بنجاح');
    }
  };

  return (
    <div className={styles.adminLayout}>
      
      {/* 1. AURORA BACKGROUND */}
      <div className={styles.auroraWrapper}>
        <div className={`${styles.auroraBlob} ${styles.blob1}`} />
        <div className={`${styles.auroraBlob} ${styles.blob2}`} />
        <div className={`${styles.auroraBlob} ${styles.blob3}`} />
        <div className={styles.grainOverlay} />
      </div>

      {/* 2. SIDE RAIL */}
      <aside id="dz-admin-sidebar" className={`${styles.sideRail} ${mobileMenuOpen ? styles.sideRailOpen : ''}`}>
        <div>
          <div className={styles.railBrand}>
            <div className={styles.brandLogo}>TT</div>
            <div className={styles.brandTextGroup}>
              <span className={styles.brandTitle}>تاجر تراك </span>
              <span className={styles.brandRoleBadge}>مدير المنصة</span>
            </div>
          </div>

          <nav className={styles.railNav}>
            <button
              onClick={() => { setActiveTab('overview'); setMobileMenuOpen(false); }}
              className={`${styles.railItem} ${activeTab === 'overview' ? styles.railItemActive : ''}`}
            >
              <div className={styles.railItemInner}>
                <span className={styles.railIcon}><Icons.BarChart /></span>
                <span>نظرة عامة والـ KPIs</span>
              </div>
            </button>

            <button
              onClick={() => { setActiveTab('payments'); setMobileMenuOpen(false); }}
              className={`${styles.railItem} ${activeTab === 'payments' ? styles.railItemActive : ''}`}
            >
              <div className={styles.railItemInner}>
                <span className={styles.railIcon}><Icons.CreditCard /></span>
                <span>الاشتراكات والدفعات</span>
              </div>
              {pendingPayments.length > 0 && (
                <span className={styles.pendingBadge}>{pendingPayments.length}</span>
              )}
            </button>

            <button
              onClick={() => { setActiveTab('merchants'); setMobileMenuOpen(false); }}
              className={`${styles.railItem} ${activeTab === 'merchants' ? styles.railItemActive : ''}`}
            >
              <div className={styles.railItemInner}>
                <span className={styles.railIcon}><Icons.Store /></span>
                <span>دليل المتاجر ({merchants.length})</span>
              </div>
            </button>

            <button
              onClick={() => { setActiveTab('telemetry'); setMobileMenuOpen(false); }}
              className={`${styles.railItem} ${activeTab === 'telemetry' ? styles.railItemActive : ''}`}
            >
              <div className={styles.railItemInner}>
                <span className={styles.railIcon}><Icons.Activity /></span>
                <span>تيار الشحن والبيانات</span>
              </div>
            </button>

            <button
              onClick={() => { setActiveTab('settings'); setMobileMenuOpen(false); }}
              className={`${styles.railItem} ${activeTab === 'settings' ? styles.railItemActive : ''}`}
            >
              <div className={styles.railItemInner}>
                <span className={styles.railIcon}><Icons.Settings /></span>
                <span>إعدادات المنصة</span>
              </div>
            </button>
          </nav>
        </div>

        <div className={styles.railFooter}>
          <div className={styles.adminProfileCard}>
            <div className={styles.adminAvatar}><Icons.User /></div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--ink-main)' }}>مدير المنصة</div>
              <div className={styles.adminEmailText}>{userEmail}</div>
            </div>
          </div>
          <form action={logout}>
            <button type="submit" className={styles.btnOutline} style={{ width: '100%', padding: '10px' }}>
              <Icons.LogOut /> تسجيل الخروج
            </button>
          </form>
        </div>
      </aside>

      {/* 3. MAIN CONTENT */}
      <main className={styles.mainContent}>
        
        {/* TOAST */}
        <div className={`${styles.toast} ${toastMsg ? styles.toastShow : ''}`}>
          {toastMsg}
        </div>

        {/* TOP BAR */}
        <SiteHeader
          variant="dashboard"
          className={styles.topBar}
          menuOpen={mobileMenuOpen}
          onMenuToggle={() => setMobileMenuOpen((open) => !open)}
          menuId="dz-admin-sidebar"
        >
          <div className={styles.pageHeaderGroup}>
            <h1>
              {activeTab === 'overview' && 'مركز القيادة والإحصائيات'}
              {activeTab === 'payments' && 'إدارة الاشتراكات وتأكيد الدفع'}
              {activeTab === 'merchants' && 'دليل المتاجر وحصص الشحن'}
              {activeTab === 'telemetry' && 'مراقبة تيار الشحن المباشر'}
              {activeTab === 'settings' && 'إعدادات المنصة والباقات'}
            </h1>
            <p>
              {activeTab === 'overview' && 'نظرة شاملة على الأداء، الإيرادات، ونشاط النواقل في الجزائر.'}
              {activeTab === 'payments' && 'مراجعة وتأكيد طلبات الترقية وتجديد الباقات.'}
              {activeTab === 'merchants' && 'إدارة المتاجر، المفاتيح، والتحكم בסقف الطلبات.'}
              {activeTab === 'telemetry' && 'تدفق لجميع تحديثات التتبع من مختلف شركات الشحن.'}
              {activeTab === 'settings' && 'تكوين بوابات الدفع الجزائرية وتسعير الباقات.'}
            </p>
          </div>

          <div className={styles.topActionsGroup}>
            <div className={styles.omniSearchWrapper}>
              <Icons.Search />
              <input
                type="text"
                placeholder="بحث برقم الطلب، المتجر، التتبع..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={styles.omniSearchInput}
              />
            </div>
          </div>
        </SiteHeader>

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div>
            <div className={styles.statsBar}>
              <div className={styles.statItem}>
                <span className={styles.cardTitle}>الدخل الشهري المتكرر (MRR)</span>
                <span className={styles.cardValue}>{mrrDzd.toLocaleString()} <small style={{ fontSize: '1rem', color: 'var(--ink-muted)' }}>DZD</small></span>
                <span className={styles.cardSub}>من الاشتراكات النشطة حالياً</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.cardTitle}>إجمالي المتاجر</span>
                <span className={styles.cardValue}>{merchants.length}</span>
                <span className={styles.cardSub}>{merchants.filter((m) => m.subscription_status === 'active').length} متجر نشط على المنصة</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.cardTitle}>إجمالي الشحنات</span>
                <span className={styles.cardValue}>{orders.length}</span>
                <span className={styles.cardSub}>شحنة معالجة بنجاح</span>
              </div>
              <div className={styles.statItem} style={{ background: pendingPayments.length > 0 ? 'var(--surface-hover)' : 'transparent' }}>
                <span className={styles.cardTitle}>دفعات معلقة</span>
                <span className={styles.cardValue}>{pendingPayments.length}</span>
                <span className={styles.cardSub} style={pendingPayments.length > 0 ? { color: 'var(--ink-main)', fontWeight: 700 } : {}}>
                  {pendingPayments.length > 0 ? 'تتطلب مراجعة إدارية' : 'محدثة ومؤكدة بالكامل'}
                </span>
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.carrierShareHeader}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>توزيع حصص الشحن (السوق الجزائري)</h3>
              </div>
              <div className={styles.carrierShareBar}>
                <div className={styles.segmentYalidine} style={{ width: `${carrierDistribution.yalidine}%` }} title={`Yalidine: ${carrierDistribution.yalidine}%`} />
                <div className={styles.segmentZR} style={{ width: `${carrierDistribution.zr}%` }} title={`ZR Express: ${carrierDistribution.zr}%`} />
                <div className={styles.segmentEco} style={{ width: `${carrierDistribution.eco}%` }} title={`EcoTrack: ${carrierDistribution.eco}%`} />
                <div className={styles.segmentMaystro} style={{ width: `${carrierDistribution.maystro}%` }} title={`Maystro: ${carrierDistribution.maystro}%`} />
                <div className={styles.segmentOther} style={{ width: `${carrierDistribution.others}%` }} title={`أخرى: ${carrierDistribution.others}%`} />
              </div>
              <div className={styles.carrierLegend}>
                <div className={styles.legendItem}><span className={styles.legendDot} style={{ background: 'var(--ink-main)' }}/> Yalidine ({carrierDistribution.yalidine}%)</div>
                <div className={styles.legendItem}><span className={styles.legendDot} style={{ background: '#4b5563' }}/> ZR Express ({carrierDistribution.zr}%)</div>
                <div className={styles.legendItem}><span className={styles.legendDot} style={{ background: '#6b7280' }}/> EcoTrack ({carrierDistribution.eco}%)</div>
                <div className={styles.legendItem}><span className={styles.legendDot} style={{ background: '#9ca3af' }}/> Maystro ({carrierDistribution.maystro}%)</div>
                <div className={styles.legendItem}><span className={styles.legendDot} style={{ background: '#d1d5db' }}/> أخرى ({carrierDistribution.others}%)</div>
              </div>
            </div>

            <div className={styles.tableContainer}>
              <div className={styles.tableHeader}>
                <h3>أحدث الشحنات (نظرة سريعة)</h3>
                <button className={`${styles.btn} ${styles.btnOutline}`} onClick={() => { setActiveTab('telemetry'); setMobileMenuOpen(false); }} style={{ padding: '8px 16px' }}>عرض التلتيتمري</button>
              </div>
              <div className={styles.tableScrollArea} style={{ maxHeight: '400px' }}>
                <table className={styles.dataTable}>
                  <thead>
                    <tr>
                      <th>الطلب</th>
                      <th>المتجر</th>
                      <th>الناقل والتتبع</th>
                      <th>الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.slice(0, 10).map((o) => {
                      const store = Array.isArray(o.merchants) ? o.merchants[0]?.store_name : (o.merchants as any)?.store_name || 'متجر';
                      return (
                        <tr key={o.id}>
                          <td><span className={styles.mono}>{o.external_order_id}</span></td>
                          <td style={{ fontWeight: 600 }}>{store}</td>
                          <td>
                            {o.carrier_name || 'ناقل مباشر'} 
                            {o.carrier_tracking_number && <span className={styles.mono} style={{ marginRight: '8px' }}>{o.carrier_tracking_number}</span>}
                          </td>
                          <td><span className={styles.pill}>{o.current_status}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: PAYMENTS */}
        {activeTab === 'payments' && (
          <div>
            {pendingPayments.length === 0 ? (
              <div className={styles.card} style={{ textAlign: 'center', padding: '60px 20px', marginBottom: '32px' }}>
                <div aria-hidden="true" style={{ width: '44px', height: '44px', margin: '0 auto 18px', display: 'grid', placeItems: 'center', border: '1px solid var(--border-soft)', borderRadius: '12px', background: '#f6f6f1', color: 'var(--ink-muted)', fontSize: '18px' }}>✓</div>
                <h3 style={{ margin: 0, fontSize: '18px' }}>لا يوجد تحويلات قيد الانتظار</h3>
                <p style={{ color: 'var(--ink-muted)', marginTop: '8px' }}>جميع اشتراكات المتاجر تمت مراجعتها وهي مفعلة حالياً.</p>
              </div>
            ) : (
              <div className={styles.listCard}>
                {pendingPayments.map((p) => {
                  const storeName = Array.isArray(p.merchants) ? p.merchants[0]?.store_name : (p.merchants as any)?.store_name || 'متجر';
                  return (
                    <div key={p.id} className={styles.listItem}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '8px' }}>
                          <strong style={{ fontSize: '18px' }}>{storeName}</strong>
                          <span className={`${styles.pill} ${styles.pillOutline}`}>{p.payment_method.toUpperCase()}</span>
                          <span className={`${styles.pill} ${styles.pillDark}`}>{p.amount_dzd.toLocaleString()} DZD</span>
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--ink-muted)', display: 'flex', gap: '24px', marginBottom: '12px' }}>
                          <div>الباقة: <strong style={{ color: 'var(--ink-main)' }}>{p.plan_tier.toUpperCase()}</strong></div>
                          <div>المرجع: <span className={styles.mono}>{p.transaction_ref || 'N/A'}</span></div>
                          <div>التاريخ: {new Date(p.created_at).toLocaleDateString('ar-EG')}</div>
                        </div>
                        {p.payment_proof_url && (
                          <a href={p.payment_proof_url} target="_blank" rel="noreferrer" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink-main)', textDecoration: 'underline' }}>
                            عرض صورة وصل التحويل ↗
                          </a>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '12px' }}>
                        <button disabled={isSubmitting} onClick={() => handleApprovePayment(p.id)} className={styles.btn}>
                          تفعيل الاشتراك
                        </button>
                        <button disabled={isSubmitting} onClick={() => handleRejectPayment(p.id)} className={`${styles.btn} ${styles.btnOutline}`}>
                          رفض الوصل
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className={styles.tableContainer}>
              <div className={styles.tableHeader}>
                <h3>سجل العمليات السابقة ({payments.length})</h3>
              </div>
              <div className={styles.tableScrollArea}>
                <table className={styles.dataTable}>
                  <thead>
                    <tr>
                      <th>المتجر</th>
                      <th>الباقة والمبلغ</th>
                      <th>طريقة الدفع</th>
                      <th>الحالة</th>
                      <th>تاريخ المراجعة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => {
                      const storeName = Array.isArray(p.merchants) ? p.merchants[0]?.store_name : (p.merchants as any)?.store_name || 'متجر';
                      return (
                        <tr key={p.id}>
                          <td style={{ fontWeight: 600 }}>{storeName}</td>
                          <td><strong>{p.plan_tier.toUpperCase()}</strong> <span className={styles.mono} style={{ marginRight: '8px' }}>{p.amount_dzd} DZD</span></td>
                          <td>{p.payment_method}</td>
                          <td>
                            {p.status === 'approved' && <span className={styles.pill}>مفعل</span>}
                            {p.status === 'pending' && <span className={`${styles.pill} ${styles.pillDark}`}>قيد المراجعة</span>}
                            {p.status === 'rejected' && <span className={`${styles.pill} ${styles.pillOutline}`}>مرفوض ✕</span>}
                          </td>
                          <td style={{ color: 'var(--ink-muted)' }}>{p.reviewed_at ? new Date(p.reviewed_at).toLocaleDateString('ar-EG') : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: MERCHANTS */}
        {activeTab === 'merchants' && (
          <div>
            <div className={styles.filterRow}>
              <button className={`${styles.filterBtn} ${merchantFilter === 'all' ? styles.filterBtnActive : ''}`} onClick={() => setMerchantFilter('all')}>الكل</button>
              <button className={`${styles.filterBtn} ${merchantFilter === 'active' ? styles.filterBtnActive : ''}`} onClick={() => setMerchantFilter('active')}>نشط</button>
              <button className={`${styles.filterBtn} ${merchantFilter === 'expiring' ? styles.filterBtnActive : ''}`} onClick={() => setMerchantFilter('expiring')}>ينتهي قريباً</button>
              <button className={`${styles.filterBtn} ${merchantFilter === 'expired' ? styles.filterBtnActive : ''}`} onClick={() => setMerchantFilter('expired')}>منتهي</button>
              <button className={`${styles.filterBtn} ${merchantFilter === 'suspended' ? styles.filterBtnActive : ''}`} onClick={() => setMerchantFilter('suspended')}>موقوف</button>
            </div>

            <div className={styles.tableContainer}>
              <div className={styles.tableScrollArea}>
                <table className={styles.dataTable}>
                  <thead>
                    <tr>
                      <th>اسم المتجر و API</th>
                      <th>الخطة والحالة</th>
                      <th>الاستهلاك الشهري</th>
                      <th>الصلاحية</th>
                      <th>إجراءات الإدارة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMerchants.map((m) => {
                      const tier = m.subscription_tier || 'starter';
                      const status = m.subscription_status || 'active';
                      const used = m.monthly_orders_used || 0;
                      const tierLimits: Record<string, number> = { starter: 30, basic: 100, growth: 200, scale: 999999 };
                      const defaultLimit = tierLimits[tier] || 30;
                      const limit = tier === 'scale' ? 999999 : (m.max_orders_limit ? Math.max(m.max_orders_limit, defaultLimit) : defaultLimit);
                      const isUnlimited = tier === 'scale' || limit >= 999999;
                      const pct = isUnlimited ? 0 : Math.min(Math.round((used / limit) * 100), 100);
                      const now = new Date();
                      const expiresAt = m.subscription_expires_at ? new Date(m.subscription_expires_at) : null;
                      const daysLeft = expiresAt ? Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 3600 * 24)) : 0;

                      return (
                        <tr key={m.id}>
                          <td>
                            <strong style={{ display: 'block', marginBottom: '6px' }}>{m.store_name}</strong>
                            <span className={styles.mono}>{m.api_key.substring(0, 10)}...</span>
                          </td>
                          <td>
                            <span className={`${styles.pill} ${status === 'active' && daysLeft > 0 ? styles.pillDark : styles.pillOutline}`}>
                              {tier.toUpperCase()}
                            </span>
                          </td>
                          <td>
                            <div style={{ fontSize: '12px', marginBottom: '6px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span>{used} / {isUnlimited ? '∞' : limit}</span>
                              {isUnlimited && (
                                <span style={{ fontSize: '10px', color: '#166534', background: '#f0f4ef', border: '1px solid #dce4dc', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                                  سقف غير محدود
                                </span>
                              )}
                            </div>
                            <div style={{ width: '100px', height: '6px', background: 'var(--bg-base)', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ 
                                width: isUnlimited ? '100%' : `${pct}%`, 
                                height: '100%', 
                                background: isUnlimited 
                                  ? 'linear-gradient(90deg, #10b981, #059669)' 
                                  : (pct > 90 ? '#ef4444' : 'var(--ink-main)') 
                              }} />
                            </div>
                          </td>
                          <td>
                            {expiresAt ? (
                              <div style={{ fontSize: '13px' }}>
                                <div style={{ fontWeight: 600 }}>{expiresAt.toLocaleDateString('ar-EG')}</div>
                                <div style={{ color: 'var(--ink-muted)', fontSize: '11px', marginTop: '4px' }}>{daysLeft > 0 ? `متبقي ${daysLeft} يوم` : 'منتهي الصلاحية'}</div>
                              </div>
                            ) : <span style={{ color: 'var(--ink-muted)' }}>اشتراك دائم</span>}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button className={`${styles.btn} ${styles.btnOutline}`} style={{ padding: '6px 14px', fontSize: '12px' }} onClick={() => openEditModal(m)}>تعديل</button>
                              <button className={`${styles.btn} ${styles.btnOutline}`} style={{ padding: '6px 14px', fontSize: '12px' }} onClick={() => handleRegenKey(m)}>مفتاح</button>
                              <button className={`${styles.btn} ${styles.btnOutline}`} style={{ padding: '6px 14px', fontSize: '12px', borderColor: status === 'suspended' ? 'var(--border-strong)' : 'rgba(239, 68, 68, 0.3)' }} onClick={() => handleToggleStatus(m)}>
                                {status === 'suspended' ? 'تفعيل' : 'تجميد'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: TELEMETRY (FIXED SCROLL WITH LAZY LOAD OBSERVER) */}
        {activeTab === 'telemetry' && (
          <div>
            <div className={styles.filterRow}>
              <button className={`${styles.filterBtn} ${carrierFilter === 'all' ? styles.filterBtnActive : ''}`} onClick={() => { setCarrierFilter('all'); setVisibleOrders(20); }}>الكل</button>
              <button className={`${styles.filterBtn} ${carrierFilter === 'yalidine' ? styles.filterBtnActive : ''}`} onClick={() => { setCarrierFilter('yalidine'); setVisibleOrders(20); }}>Yalidine</button>
              <button className={`${styles.filterBtn} ${carrierFilter === 'zr' ? styles.filterBtnActive : ''}`} onClick={() => { setCarrierFilter('zr'); setVisibleOrders(20); }}>ZR Express</button>
              <button className={`${styles.filterBtn} ${carrierFilter === 'eco' ? styles.filterBtnActive : ''}`} onClick={() => { setCarrierFilter('eco'); setVisibleOrders(20); }}>EcoTrack</button>
              <button className={`${styles.filterBtn} ${carrierFilter === 'maystro' ? styles.filterBtnActive : ''}`} onClick={() => { setCarrierFilter('maystro'); setVisibleOrders(20); }}>Maystro</button>
            </div>

            <div className={styles.tableContainer}>
              <div className={styles.tableHeader}>
                <h3>أحداث الشحن الحية</h3>
                <span style={{ fontSize: '13px', color: 'var(--ink-muted)' }}>يتم عرض {Math.min(visibleOrders, filteredOrders.length)} من {filteredOrders.length}</span>
              </div>
              <div className={styles.tableScrollArea}>
                <table className={styles.dataTable}>
                  <thead>
                    <tr>
                      <th>المتجر</th>
                      <th>رقم الطلب (Store)</th>
                      <th>الناقل ورقم التتبع</th>
                      <th>الحالة التشغيلية</th>
                      <th>العميل</th>
                      <th>تاريخ المعالجة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.slice(0, visibleOrders).map((o) => {
                      const store = Array.isArray(o.merchants) ? o.merchants[0]?.store_name : (o.merchants as any)?.store_name || 'متجر';
                      return (
                        <tr key={o.id}>
                          <td style={{ fontWeight: 600 }}>{store}</td>
                          <td><span className={styles.mono}>{o.external_order_id}</span></td>
                          <td>
                            {o.carrier_name || '—'} 
                            {o.carrier_tracking_number && <div className={styles.mono} style={{ display: 'inline-block', marginRight: '8px' }}>{o.carrier_tracking_number}</div>}
                          </td>
                          <td><span className={`${styles.pill} ${styles.pillDark}`}>{o.current_status}</span></td>
                          <td style={{ color: 'var(--ink-muted)' }}>{o.customer_name || '—'}</td>
                          <td style={{ color: 'var(--ink-muted)', fontSize: '13px' }}>{new Date(o.created_at).toLocaleString('ar-EG')}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {/* Sentinel for IntersectionObserver to trigger loading more items */}
                {visibleOrders < filteredOrders.length && (
                  <div id="scroll-sentinel" style={{ padding: '20px', textAlign: 'center', color: 'var(--ink-muted)', fontSize: '13px' }}>
                    يتم التحميل...
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: SETTINGS */}
        {activeTab === 'settings' && (
          <div className={styles.statsBar}>
            <div className={styles.statItem}>
              <h3 style={{ margin: '0 0 24px', fontSize: '18px', fontWeight: 700 }}>بيانات الاستلام البنكي لـ BaridiMob</h3>
              <p style={{ fontSize: '13px', color: 'var(--ink-muted)', marginBottom: '24px' }}>هذه الحسابات معتمدة للدفع اليدوي من قبل المتاجر.</p>
              
              <div style={{ marginBottom: '20px' }}>
                <label className={styles.formLabel}>رقم الحساب البريدي الجاري (RIP)</label>
                <div className={styles.mono} style={{ fontSize: '16px', padding: '12px 16px', display: 'inline-block' }}>00799999002233445566</div>
              </div>
              
              <div>
                <label className={styles.formLabel}>الاسم الكامل لصاحب الحساب</label>
                <div style={{ fontWeight: 600, fontSize: '15px' }}>تاجر تراك </div>
              </div>
            </div>

            <div className={styles.statItem}>
              <h3 style={{ margin: '0 0 24px', fontSize: '18px', fontWeight: 700 }}>تسعيرة الباقات (بالدينار الجزائري)</h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '20px', borderBottom: '1px solid var(--border-soft)' }}>
                  <span style={{ color: 'var(--ink-muted)', fontWeight: 600 }}>باقة التجريب (Starter)</span>
                  <strong>0 DZD <span style={{ fontSize: '12px', color: 'var(--ink-light)', fontWeight: 400 }}>/ 100 طلب مجاني</span></strong>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '20px', borderBottom: '1px solid var(--border-soft)' }}>
                  <span style={{ color: 'var(--ink-muted)', fontWeight: 600 }}>باقة النمو (Growth)</span>
                  <strong>3,500 DZD <span style={{ fontSize: '12px', color: 'var(--ink-light)', fontWeight: 400 }}>/ 1,500 طلب شهرياً</span></strong>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--ink-main)', fontWeight: 700 }}>باقة التوسع (Scale)</span>
                  <strong style={{ color: 'var(--ink-main)' }}>7,500 DZD <span style={{ fontSize: '12px', color: 'var(--ink-muted)', fontWeight: 400 }}>/ غير محدود</span></strong>
                </div>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* EDIT MERCHANT MODAL */}
      {editingMerchant && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
              <h3 style={{ fontSize: '20px', fontWeight: 800, margin: 0 }}>تعديل اشتراك المتجر</h3>
              <button onClick={() => setEditingMerchant(null)} style={{ background: 'transparent', border: 'none', color: 'var(--ink-light)', cursor: 'pointer', display: 'flex' }}>
                <Icons.X />
              </button>
            </div>

            <div style={{ marginBottom: '24px', padding: '16px', background: 'var(--bg-base)', borderRadius: '12px' }}>
              <strong style={{ display: 'block', fontSize: '15px' }}>{editingMerchant.store_name}</strong>
              <span className={styles.mono} style={{ border: 'none', padding: 0, marginTop: '4px', display: 'block' }}>{editingMerchant.api_key}</span>
            </div>

            <form onSubmit={handleSaveManualEdit}>
              <div style={{ marginBottom: '20px' }}>
                <label className={styles.formLabel}>نوع الباقة (Tier)</label>
                <select 
                  name="tier" 
                  value={editTier} 
                  onChange={(e) => {
                    const newTier = e.target.value;
                    setEditTier(newTier);
                    const tierLimits: Record<string, number> = { starter: 30, basic: 100, growth: 200, scale: 999999 };
                    setEditLimit(tierLimits[newTier] || 30);
                  }}
                  className={styles.input}
                >
                  <option value="starter">مجانية (30 طلباً)</option>
                  <option value="basic">100 طلب (1,000 دج)</option>
                  <option value="growth">200 طلب (1,800 دج)</option>
                  <option value="scale">غير محدودة (2,500 دج - سقف مفتوح)</option>
                </select>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label className={styles.formLabel}>تمديد الصلاحية (بالأيام المضافة)</label>
                <input type="number" name="days" defaultValue={30} min={1} max={365} className={styles.input} />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label className={styles.formLabel}>سقف الطلبات الشهري الجديد (Limit)</label>
                <input 
                  type="number" 
                  name="limit" 
                  value={editLimit} 
                  onChange={(e) => setEditLimit(parseInt(e.target.value, 10) || 0)} 
                  className={styles.input}
                  disabled={editTier === 'scale'}
                />
                <small style={{ color: 'var(--ink-muted)', display: 'block', marginTop: '6px', fontSize: '11px' }}>
                  {editTier === 'scale' ? 'باقة غير محدودة: تم ضبط السقف تلقائياً على 999999 (بدون أي حد).' : `الحد الافتراضي للباقة المختارة: ${editLimit} طلب شهرياً.`}
                </small>
              </div>

              <div style={{ marginBottom: '28px', padding: '12px 14px', background: 'var(--bg-base)', borderRadius: '10px', border: '1px solid var(--border-soft)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                  <input type="checkbox" name="reset_used" value="true" />
                  <span>تصفير عداد الطلبات المستهلكة للشهر الجديد (العداد الحالي: {editingMerchant.monthly_orders_used || 0})</span>
                </label>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setEditingMerchant(null)} className={`${styles.btn} ${styles.btnOutline}`}>إلغاء الأمر</button>
                <button type="submit" disabled={isSubmitting} className={styles.btn}>{isSubmitting ? 'جاري الحفظ...' : 'تأكيد وحفظ التعديلات'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}