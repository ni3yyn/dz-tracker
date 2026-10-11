'use client';

import React, { useState } from 'react';
import { login, signup } from './actions';
import styles from './login.module.css';

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const action = isLogin ? login : signup;
    
    try {
      const res = await action(formData);
      // إذا رجع الكود بخطأ واضح من Supabase
      if (res?.error) {
        setError(res.error);
        setLoading(false);
      }
      // ملاحظة: إذا نجح التسجيل، فإن دالة redirect ستقوم بقطع التنفيذ ولن نصل إلى هنا
    } catch (err) {
      // إذا حدث خطأ غير متوقع
      setLoading(false);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>{isLogin ? 'تسجيل الدخول' : 'إنشاء حساب تاجر جديد'}</h1>
        
        {error && <div className={styles.errorAlert}>{error}</div>}

        <form onSubmit={handleSubmit} className={styles.form}>
          {!isLogin && (
            <div className={styles.inputGroup}>
              <label>اسم المتجر</label>
              <input type="text" name="storeName" required placeholder="مثال: متجر الأناقة" />
            </div>
          )}

          <div className={styles.inputGroup}>
            <label>البريد الإلكتروني</label>
            <input type="email" name="email" required placeholder="name@domain.com" dir="ltr" />
          </div>

          <div className={styles.inputGroup}>
            <label>كلمة المرور</label>
            <input type="password" name="password" required minLength={6} placeholder="******" dir="ltr" />
          </div>

          <button type="submit" disabled={loading} className={styles.submitBtn}>
            {loading ? 'جاري المعالجة...' : (isLogin ? 'دخول' : 'إنشاء الحساب')}
          </button>
        </form>

        <p className={styles.switchMode}>
          {isLogin ? 'ليس لديك حساب؟ ' : 'لديك حساب بالفعل؟ '}
          <button type="button" onClick={() => { setIsLogin(!isLogin); setError(null); }} className={styles.switchBtn}>
            {isLogin ? 'أنشئ حساباً الآن' : 'سجل دخولك'}
          </button>
        </p>
      </div>
    </div>
  );
}