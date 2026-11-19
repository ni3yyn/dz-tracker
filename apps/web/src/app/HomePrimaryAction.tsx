'use client';

import { useSiteAuthentication } from '../components/useSiteAuthentication';

type Props = {
  className: string;
};

export default function HomePrimaryAction({ className }: Props) {
  const isAuthenticated = useSiteAuthentication();

  return (
    <a className={className} href={isAuthenticated ? '/merchant' : '/register'}>
      {isAuthenticated ? 'افتح لوحة التاجر' : 'اربط متجرك الآن'}
      {' '}
      <span aria-hidden="true">↗</span>
    </a>
  );
}
