import * as dotenv from 'dotenv';
import { envSchema } from './env.schema';

dotenv.config({ path: ['.env.local', '.env'] });

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('❌ Invalid environment variables:');
  console.error(result.error.format()); // ✅ No type arguments, no warning
  process.exit(1);
}

export const validatedEnv = result.data;
