import { createHash, createHmac } from 'node:crypto';

const args = parseArgs(process.argv.slice(2));
const planDefaults = {
  trial: { id: 'trial', name: '试用版', seatLimit: 1, profileLimit: 5, supportLevel: 'community' },
  pro: { id: 'pro', name: '专业版', seatLimit: 1, profileLimit: 50, supportLevel: 'standard' },
  team: { id: 'team', name: '团队版', seatLimit: 3, profileLimit: 200, supportLevel: 'priority' }
};
const planId = args.plan ?? 'trial';
const basePlan = planDefaults[planId];

if (!basePlan) {
  throw new Error(`Unknown plan: ${planId}`);
}

const team = args.team ?? '试卖团队';
const days = Number(args.days ?? (planId === 'trial' ? 7 : 30));
const issuedAt = new Date();
const expiresAt = new Date(issuedAt.getTime() + days * 86_400_000);
const plan = {
  ...basePlan,
  seatLimit: args.seats ? Number(args.seats) : basePlan.seatLimit,
  profileLimit: args.profiles ? Number(args.profiles) : basePlan.profileLimit
};
const payload = {
  codeId: createHash('sha256').update(`${team}:${plan.id}:${issuedAt.toISOString()}:${expiresAt.toISOString()}`).digest('hex').slice(0, 16),
  teamName: team,
  plan,
  issuedAt: issuedAt.toISOString(),
  expiresAt: expiresAt.toISOString()
};
const secret = process.env.FINGERBROWSER_LICENSE_SIGNING_SECRET ?? 'fingerbrowser-commercial-trial-dev-secret';
const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
const signature = createHmac('sha256', secret).update(encoded).digest('base64url');

console.log(`FBLC1.${encoded}.${signature}`);

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value.startsWith('--')) {
      result[value.slice(2)] = values[index + 1];
      index += 1;
    }
  }
  return result;
}
