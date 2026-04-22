import { QuizSchema } from './src/services/ai/schemas';
import { asSchema } from 'ai';

const { jsonSchema } = asSchema(QuizSchema);
console.log(JSON.stringify(jsonSchema, null, 2));
