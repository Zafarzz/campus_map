import type { Campus } from '../../domain/campus/types';
import { demoCampus } from '../../data/demo-campus';

/**
 * Campus data source. Async so it can later be backed by an API/JSON file
 * without changing callers.
 */
export async function loadCampus(): Promise<Campus> {
  return demoCampus;
}
