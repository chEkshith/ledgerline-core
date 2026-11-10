import React, { useState, useEffect, useCallback } from 'react';
import { getHealthStatus } from '../services/api';
import { formatTimestamp } from '../utils/formatters';
import {
  Activity,
  RefreshCw,
  Server,
  Database,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Gauge,
  Timer,
} from 'lucide-react';
import Alert from '../components/Alert';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  PageHeader,
  PageLoading,
  StatCard,
} from '../components/ui';

function statusVariant(status) {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'UP' || normalized === 'CONNECTED') return 'success';
  if (normalized === 'DEGRADED') return 'warning';
  if (normalized === 'DOWN' || normalized === 'DISCONNECTED') return 'danger';
  return 'neutral';
}

function formatUptime(seconds) {
  if (seconds === null || seconds === undefined) return '—';
  const total = Number(seconds);
  if (!Number.isFinite(total) || total < 0) return '—';
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = Math.floor(total % 60);
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (!days && !hours) parts.push(`${secs}s`);
  return parts.join(' ') || '0s';
}

export default function Health() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState(null);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getHealthStatus();
      setHealth(response);
    } catch (err) {
      setHealth({
        ok: false,
        error: err.message || 'Unknown network error',
      });
    } finally {
      setLoading(false);
      setLastChecked(new Date());
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 15000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  if (!health && loading) {
    return <PageLoading label="Probing system health…" />;
  }

  const data = health?.data;
  const serverStatus = data?.status || (health?.ok ? 'UP' : 'DOWN');
  const dbStatus = data?.database?.status || (health?.ok ? 'UNKNOWN' : 'DISCONNECTED');
  const dbError = data?.database?.error;
  const overallTone = statusVariant(serverStatus);

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-fadeIn">
      <PageHeader
        eyebrow="System health"
        title="Health & telemetry"
        description="Live infrastructure probes and database connection verification. Refreshes every 15 seconds."
        actions={
          <Button variant="secondary" size="sm" onClick={fetchHealth} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-brand' : ''}`} aria-hidden="true" />
            {loading ? 'Probing…' : 'Refresh telemetry'}
          </Button>
        }
      />

      {health?.error && <Alert type="error" message={health.error} />}

      <Card
        className={
          overallTone === 'success'
            ? 'border-emerald-200'
            : overallTone === 'warning'
              ? 'border-amber-200'
              : 'border-red-200'
        }
      >
        <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                overallTone === 'success'
                  ? 'bg-success-soft text-success'
                  : overallTone === 'warning'
                    ? 'bg-warning-soft text-warning'
                    : 'bg-danger-soft text-danger'
              }`}
            >
              {overallTone === 'success' ? (
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
              ) : overallTone === 'warning' ? (
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              ) : (
                <XCircle className="h-5 w-5" aria-hidden="true" />
              )}
            </span>
            <div>
              <h2 className="text-base font-semibold text-ink">
                {overallTone === 'success'
                  ? 'All systems operational'
                  : overallTone === 'warning'
                    ? 'System degraded'
                    : 'System unavailable'}
              </h2>
              <p className="mt-0.5 text-xs text-muted">
                {data
                  ? `${data.service || 'ledgerline-server'} v${data.version || '—'} · checked ${formatTimestamp(
                      data.timestamp
                    )}`
                  : 'Unable to reach the health endpoint.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={overallTone} dot>
              API {serverStatus}
            </Badge>
            <Badge variant={statusVariant(dbStatus)} dot>
              DB {dbStatus}
            </Badge>
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="API status"
          value={serverStatus}
          detail={data?.service || 'ledgerline-server'}
          icon={Server}
          tone={overallTone === 'success' ? 'success' : overallTone === 'warning' ? 'warning' : 'neutral'}
        />
        <StatCard
          label="Database"
          value={dbStatus}
          detail={data?.database?.driver || 'node-postgres (pg)'}
          icon={Database}
          tone={statusVariant(dbStatus) === 'success' ? 'success' : 'warning'}
        />
        <StatCard
          label="Round-trip latency"
          value={health?.latencyMs !== undefined ? `${health.latencyMs} ms` : '—'}
          detail="Client to health endpoint"
          icon={Gauge}
          tone="info"
        />
        <StatCard
          label="System uptime"
          value={formatUptime(data?.uptimeSeconds)}
          detail={data?.timestamp ? `Reported ${formatTimestamp(data.timestamp)}` : 'Unavailable'}
          icon={Timer}
          tone="brand"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand">
                <Server className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-ink">Express API server</h2>
                <p className="mt-0.5 text-xs text-muted">Health probe endpoint</p>
              </div>
            </div>
            <Badge variant={statusVariant(serverStatus)} dot>
              {serverStatus}
            </Badge>
          </CardHeader>

          <CardBody>
            <dl className="space-y-2 text-xs">
              <div className="flex items-center justify-between gap-3 border-b border-line pb-2">
                <dt className="text-muted">Endpoint</dt>
                <dd className="font-mono text-ink-soft">/api/health</dd>
              </div>
              <div className="flex items-center justify-between gap-3 border-b border-line pb-2">
                <dt className="text-muted">Service</dt>
                <dd className="font-mono text-ink-soft">{data?.service || '—'}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 border-b border-line pb-2">
                <dt className="text-muted">Version</dt>
                <dd className="font-mono text-ink-soft">{data?.version || '—'}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 border-b border-line pb-2">
                <dt className="text-muted">Round-trip latency</dt>
                <dd className="font-mono font-semibold text-ink tabular-nums">
                  {health?.latencyMs !== undefined ? `${health.latencyMs} ms` : '—'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">Uptime</dt>
                <dd className="font-mono text-ink-soft">{formatUptime(data?.uptimeSeconds)}</dd>
              </div>
            </dl>
          </CardBody>

          <CardFooter>
            <p className="flex items-center gap-1.5 text-[11px] text-muted">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              Last polled {lastChecked ? lastChecked.toLocaleTimeString('en-IN') : '—'}
            </p>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
                <Database className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-ink">PostgreSQL ledger database</h2>
                <p className="mt-0.5 text-xs text-muted">Connection and query verification</p>
              </div>
            </div>
            <Badge variant={statusVariant(dbStatus)} dot>
              {dbStatus}
            </Badge>
          </CardHeader>

          <CardBody className="space-y-4">
            <dl className="space-y-2 text-xs">
              <div className="flex items-center justify-between gap-3 border-b border-line pb-2">
                <dt className="text-muted">Driver</dt>
                <dd className="font-mono text-ink-soft">{data?.database?.driver || '—'}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 border-b border-line pb-2">
                <dt className="text-muted">Query latency</dt>
                <dd className="font-mono font-semibold text-ink tabular-nums">
                  {data?.database?.latencyMs !== undefined ? `${data.database.latencyMs} ms` : '—'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 border-b border-line pb-2">
                <dt className="text-muted">Server time</dt>
                <dd className="text-right font-mono text-ink-soft">
                  {data?.database?.serverTime ? formatTimestamp(data.database.serverTime) : '—'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">Isolation</dt>
                <dd className="font-mono text-ink-soft">RLS + session context</dd>
              </div>
            </dl>

            {dbError && <Alert type="error" message={`Database error: ${dbError}`} />}
          </CardBody>

          <CardFooter>
            <p className="text-[11px] text-muted">
              The probe runs <code className="font-mono">SELECT 1</code> against the ledger pool.
            </p>
          </CardFooter>
        </Card>
      </div>

      <div className="flex items-center justify-end gap-1.5 text-[11px] text-muted">
        <Activity className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
        Auto-refreshes every 15 seconds
      </div>
    </div>
  );
}
