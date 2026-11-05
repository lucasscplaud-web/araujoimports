import { isIP } from 'node:net';
import proxyaddr from 'proxy-addr';
import { ClientError } from './validation.js';

// Trust requires BOTH an operator-verified hop count and known proxy addresses.
// Headers supplied by a request never establish that trust.
export function createProxyPolicy(env = process.env) {
  const raw = env.TRUST_PROXY ?? (env.NODE_ENV === 'production' ? '' : '0');
  if (!/^[0-8]$/.test(raw)) throw new Error('TRUST_PROXY deve ser um inteiro entre 0 e 8, definido explicitamente em produção');
  const hops = Number(raw);
  const ranges = (env.TRUSTED_PROXY_CIDRS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (hops && !ranges.length) throw new Error('TRUSTED_PROXY_CIDRS é obrigatório quando TRUST_PROXY > 0');
  for (const range of ranges) {
    const [ip, prefix, extra] = range.split('/');
    const version = isIP(ip);
    if (!version || extra !== undefined || (prefix !== undefined &&
      (!/^\d+$/.test(prefix) || Number(prefix) < 1 || Number(prefix) > (version === 4 ? 32 : 128)))) {
      throw new Error('TRUSTED_PROXY_CIDRS deve conter somente IPs/CIDRs explícitos, sem redes universais');
    }
  }
  if (!hops && ranges.length) throw new Error('TRUSTED_PROXY_CIDRS exige TRUST_PROXY > 0');
  const trusted = ranges.length ? proxyaddr.compile(ranges) : () => false;
  const trust = hops ? (ip, index) => index < hops && trusted(ip) : false;
  return {
    hops, trust,
    validate(req) {
      // Express does not interpret RFC Forwarded. Do not let it bypass XFF policy.
      if (req.get('forwarded')) throw new ClientError('PROXY_INVALIDO', 400);
      if (!hops) {
        if (['x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto'].some(h => req.get(h))) {
          throw new ClientError('PROXY_INVALIDO', 400);
        }
        return;
      }
      const chain = proxyaddr.all(req, trust);
      if (chain.length !== hops + 1 || chain.some(ip => !isIP(ip))) {
        throw new ClientError('PROXY_INVALIDO', 400);
      }
    }
  };
}
