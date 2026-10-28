/**
 * Loads the Admin Assistant question set (34 written questions in 5 sections) and publishes the
 * "LIBRA RP — ADMIN ASSISTANT INTERVIEW". Requires an active Head Admin. Safe to re-run: it
 * skips if the interview already exists.
 *
 *   npm run seed:admin-assistant
 */
import { ADMIN_ASSISTANT_INTERVIEW, ADMIN_ASSISTANT_SECTIONS } from './data/admin-assistant';
import { run } from './lib/load-question-set';

run(ADMIN_ASSISTANT_INTERVIEW, ADMIN_ASSISTANT_SECTIONS);
