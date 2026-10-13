// Vercel serverless function: every request is rewritten here (see vercel.json).
// The NestJS app is compiled by `npm run build` into dist/ before Vercel bundles this function.
module.exports = require('../dist/serverless').default;
