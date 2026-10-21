'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  BookOpenCheck,
  ClipboardCheck,
  Gauge,
  History,
  LayoutList,
  LogOut,
  Menu,
  Radio,
  ScrollText,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Trophy,
  UserCircle2,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LibraMark } from '@/components/brand/libra-mark';
import { DropdownContent, DropdownItem, DropdownLabel, DropdownMenu, DropdownSeparator, DropdownTrigger } from '@/components/ui/primitives';
import { Spinner } from '@/components/ui/data';
import { useMe, useOverview } from '@/hooks/use-admin';
import { cn, humanize, initials } from '@/lib/utils';
import { ApiError } from '@/lib/api';
import { adminApi } from '@/services/admin';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: 'live' | 'pending';
  headOnly?: boolean;
  exact?: boolean;
}

const NAV: { section: string; items: NavItem[] }[] = [
  { section: 'Overview', items: [{ href: '/admin', label: 'Dashboard', icon: Gauge, exact: true }] },
  {
    section: 'Recruitment',
    items: [
      { href: '/admin/candidates', label: 'Candidates', icon: Users },
      { href: '/admin/interviews', label: 'Interviews', icon: LayoutList },
      { href: '/admin/questions', label: 'Question Bank', icon: BookOpenCheck },
      { href: '/admin/monitor', label: 'Live Monitoring', icon: Radio, badge: 'live' },
      { href: '/admin/history', label: 'Interview History', icon: History },
    ],
  },
  {
    section: 'Evaluation',
    items: [
      { href: '/admin/evaluations', label: 'Pending Reviews', icon: ClipboardCheck, badge: 'pending' },
      { href: '/admin/results', label: 'Results', icon: Trophy },
      { href: '/admin/disqualifications', label: 'Disqualifications', icon: ShieldAlert },
    ],
  },
  {
    section: 'Management',
    items: [
      { href: '/admin/curators', label: 'Support Curators', icon: UserCog, headOnly: true },
      { href: '/admin/logs', label: 'Activity Logs', icon: ScrollText },
    ],
  },
  {
    section: 'Account',
    items: [
      { href: '/admin/profile', label: 'Profile', icon: UserCircle2 },
      { href: '/admin/settings', label: 'Settings', icon: Settings },
    ],
  },
];

function isActive(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { data: me } = useMe();
  const { data: overview } = useOverview();
  const router = useRouter();
  const qc = useQueryClient();
  const isHead = me?.user.role === 'HEAD_ADMIN';

  const logout = async () => {
    await adminApi.logout().catch(() => undefined);
    qc.clear();
    router.replace('/admin/login');
  };

  return (
    <div className="flex h-full flex-col">
      <Link href="/admin" onClick={onNavigate} className="group flex items-center gap-3 px-5 pb-6 pt-6">
        <LibraMark className="h-9 w-9 transition-transform duration-500 group-hover:rotate-[-6deg]" />
        <div className="leading-none">
          <div className="font-display text-[19px] font-semibold text-gold-metal">Libra RP</div>
          <div className="mt-0.5 text-[11.5px] text-fg-3">Admin panel</div>
        </div>
      </Link>
      <div className="rule-gold mx-5 mb-3 opacity-60" />

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-6 pt-2">
        {NAV.map((group) => {
          const items = group.items.filter((i) => !i.headOnly || isHead);
          if (!items.length) return null;
          return (
            <div key={group.section}>
              <p className="px-3 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-fg-4">{group.section}</p>
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const active = isActive(pathname, item);
                  const count = item.badge === 'live' ? overview?.activeInterviews : item.badge === 'pending' ? overview?.pendingReviews : undefined;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        className={cn(
                          'group/nav relative flex items-center gap-3 rounded-[9px] px-3 py-2 text-[13px] font-semibold transition-colors',
                          active ? 'bg-white/[0.06] text-fg' : 'text-fg-3 hover:bg-white/[0.035] hover:text-fg-2',
                        )}
                      >
                        <item.icon className={cn('relative h-[17px] w-[17px] shrink-0 transition-colors', active ? 'text-gold-bright' : 'text-fg-4 group-hover/nav:text-fg-3')} />
                        <span className="relative flex-1 truncate">{item.label}</span>
                        {item.headOnly && <span className="relative rounded-[4px] border border-gold/25 px-1 text-[8.5px] font-bold uppercase tracking-[0.1em] text-gold/80">Head</span>}
                        {!!count && count > 0 && (
                          <span
                            className={cn(
                              'relative flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular',
                              item.badge === 'live' ? 'bg-ok/15 text-[#7FD3B1]' : 'bg-gold/15 text-gold-bright',
                            )}
                          >
                            {item.badge === 'live' && <span className="mr-1 h-1.5 w-1.5 animate-pulse rounded-full bg-ok" />}
                            {count}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-line p-3">
        <DropdownMenu>
          <DropdownTrigger asChild>
            <button className="flex w-full items-center gap-3 rounded-[10px] p-2 text-left transition hover:bg-white/[0.04]">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] border border-gold/30 bg-[linear-gradient(180deg,rgba(201,169,97,0.22),rgba(201,169,97,0.06))] font-display text-[14px] font-semibold text-gold-bright">
                {me ? initials(me.user.fullName) : '··'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold text-fg">{me?.user.fullName ?? '—'}</p>
                <p className="truncate text-[10.5px] font-semibold uppercase tracking-[0.12em] text-gold/80">{me ? humanize(me.user.role) : ''}</p>
              </div>
            </button>
          </DropdownTrigger>
          <DropdownContent align="start" className="w-[230px]">
            <DropdownLabel>@{me?.user.username}</DropdownLabel>
            <DropdownItem icon={<UserCircle2 />} onSelect={() => router.push('/admin/profile')}>
              Profile
            </DropdownItem>
            <DropdownItem icon={<ShieldCheck />} onSelect={() => router.push('/admin/settings')}>
              Security settings
            </DropdownItem>
            <DropdownSeparator />
            <DropdownItem icon={<LogOut />} danger onSelect={logout}>
              Sign out
            </DropdownItem>
          </DropdownContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { data, isLoading, error, refetch } = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: overview } = useOverview();

  const authFailed = error instanceof ApiError && error.status === 401;
  useEffect(() => {
    if (authFailed) router.replace('/admin/login?expired=1');
  }, [authFailed, router]);
  useEffect(() => setMobileOpen(false), [pathname]);
  const mustChange = !!data?.user.mustChangePassword;
  useEffect(() => {
    if (mustChange && pathname !== '/admin/settings') router.replace('/admin/settings');
  }, [mustChange, pathname, router]);

  if (error && !authFailed && !data) {
    return (
      <div className="grid min-h-dvh place-items-center bg-ink px-6 text-center">
        <div className="flex flex-col items-center gap-4">
          <LibraMark className="h-12 w-12" />
          <p className="font-display text-[22px] font-bold">Control center unreachable</p>
          <p className="max-w-[360px] text-[13px] text-fg-3">The recruitment server is not responding. Your session is intact — retrying will reconnect you.</p>
          <button onClick={() => void refetch()} className="rounded-[9px] border border-gold/40 px-4 py-2 text-[13px] font-semibold text-gold-bright hover:bg-gold/10">
            Retry connection
          </button>
        </div>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="grid min-h-dvh place-items-center bg-ink">
        <div className="flex flex-col items-center gap-5">
          <LibraMark className="h-12 w-12" glow />
          <Spinner />
          <p className="label-caps">Securing session</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-dvh bg-ink">

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[256px] border-r border-line bg-[linear-gradient(180deg,#0E1015_0%,#0A0B0F_100%)] lg:block">
        <Sidebar />
      </aside>

      {/* Mobile top bar + drawer */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-line bg-ink/85 px-4 backdrop-blur-xl lg:hidden">
        <button onClick={() => setMobileOpen(true)} className="rounded-md p-2 text-fg-2 hover:bg-white/5" aria-label="Open navigation">
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <LibraMark className="h-7 w-7" />
          <span className="font-display text-[16px] font-semibold text-gold-metal">Libra RP</span>
        </div>
        <Link href="/admin/monitor" className="flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[11px] font-bold text-fg-2">
          <Activity className="h-3.5 w-3.5 text-ok" />
          {overview?.activeInterviews ?? 0}
        </Link>
      </header>
      {mobileOpen && (
          <>
            <div className="fixed inset-0 z-50 bg-black/70 lg:hidden" onClick={() => setMobileOpen(false)} />
            <aside className="fixed inset-y-0 left-0 z-50 w-[280px] border-r border-line bg-[#0C0D12] lg:hidden">
              <button onClick={() => setMobileOpen(false)} className="absolute right-3 top-5 rounded-md p-1.5 text-fg-3 hover:bg-white/5" aria-label="Close navigation">
                <X className="h-4 w-4" />
              </button>
              <Sidebar onNavigate={() => setMobileOpen(false)} />
            </aside>
          </>
        )}

      <main className="relative lg:pl-[256px]">
        {data.user.mustChangePassword && pathname !== '/admin/settings' && (
          <div className="border-b border-warn/25 bg-warn/[0.07] px-6 py-2.5 text-center text-[12.5px] text-[#F0C47A]">
            You are using a temporary password.{' '}
            <Link href="/admin/settings" className="font-bold underline underline-offset-4">
              Change it now
            </Link>{' '}
            and enable two-step verification.
          </div>
        )}
        <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, actions, icon }: { eyebrow?: string; title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-[12px] text-fg-4">{eyebrow}</p>}
        <h1 className="text-[24px] font-semibold leading-tight text-fg">
          {title}
        </h1>
        {description && <p className="mt-2 max-w-[640px] text-[13.5px] leading-relaxed text-fg-3">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, description, actions, children, className, bodyClassName, icon }: { title?: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; bodyClassName?: string; icon?: React.ReactNode }) {
  return (
    <section className={cn('panel overflow-hidden rounded-[10px]', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-2.5">
            {icon && <span className="text-fg-3 [&_svg]:h-4 [&_svg]:w-4">{icon}</span>}
            <div className="min-w-0">
              {title && <h2 className="truncate text-[14px] font-semibold text-fg">{title}</h2>}
              {description && <p className="truncate text-[12px] text-fg-3">{description}</p>}
            </div>
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

