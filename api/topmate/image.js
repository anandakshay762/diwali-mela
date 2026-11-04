// Vercel-style serverless function: GET /api/topmate/image?u=<username> streams the profile photo
import { handle } from '../../server/topmate.mjs';

export default function handler(req, res) {
  return handle(req, res);
}
