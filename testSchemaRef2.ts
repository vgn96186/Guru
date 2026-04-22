import { AIContentSchema } from './src/services/ai/schemas';
import { asSchema } from 'ai';

const { jsonSchema } = asSchema(AIContentSchema);
console.log(JSON.stringify(jsonSchema, null, 2));
