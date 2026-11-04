// Vercel-style serverless function: GET /api/topmate?u=<username>
import { handle } from '../server/topmate.mjs';

export default function handler(req, res) {
  return handle(req, res);
}
