/**
 * Loads the Admin (Level 2) question set (50 written questions in 6 sections, built from the server
 * rules) and publishes the "LIBRA RP — ADMIN (LEVEL 2) INTERVIEW". Requires an active Head Admin.
 * Safe to re-run: it skips if the interview already exists.
 *
 *   npm run seed:admin-level2
 */
import { ADMIN_LEVEL2_INTERVIEW, ADMIN_LEVEL2_SECTIONS } from './data/admin-level2';
import { run } from './lib/load-question-set';

run(ADMIN_LEVEL2_INTERVIEW, ADMIN_LEVEL2_SECTIONS);
