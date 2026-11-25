// Placeholder pricing. Wire these to your payment gateway later.
module.exports = [
  { id: 'free', name: 'Free', price: 0, credits: null, note: 'Starter credits on sign-up' },
  { id: 'starter', name: 'Starter', price: 9, credits: 50, note: 'For occasional creators' },
  { id: 'pro', name: 'Pro', price: 29, credits: 200, note: 'For weekly publishing', featured: true },
  { id: 'scale', name: 'Scale', price: 79, credits: 700, note: 'For teams and agencies' },
];
