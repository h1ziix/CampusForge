import bcrypt from 'bcryptjs';
import { fixtureState } from './state';

export default {
  async compare(password: string, hash: string) {
    fixtureState().counters.compares++;
    return bcrypt.compare(password, hash);
  },
  async hash(password: string, rounds: number) {
    fixtureState().counters.hashes++;
    return bcrypt.hash(password, rounds);
  },
};
