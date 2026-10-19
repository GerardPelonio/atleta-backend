import app from '../app';

function handler(req: any, res: any) {
  return app(req, res);
}

export default handler;

// Ensure CommonJS root export for Vercel serverless runtime
module.exports = handler;
module.exports.default = handler;


