/**
 * Default prompt templates for the application.
 * Add new templates here to extend the available options.
 */

export interface PromptTemplate {
  id: string;
  name: string;
  prompt: string;
}

export const DEFAULT_PROMPT_TEMPLATES: PromptTemplate[] = [
  { 
    id: 'default-none',
    name: 'None (Default)', 
    prompt: '' 
  },
  { 
    id: 'default-concise',
    name: 'Concise Coder', 
    prompt: 'You are a senior software engineer. Give concise, practical answers with clean code examples. Avoid unnecessary explanations - get straight to the solution.' 
  },
  { 
    id: 'default-interview',
    name: 'Interview Helper', 
    prompt: 'You are helping someone in a technical interview. Provide clear, well-structured answers that demonstrate strong problem-solving skills. Include time/space complexity analysis when relevant.' 
  },
  {
    id: 'default-exam',
    name: 'Exam Mode',
    prompt: 'You are helping a student during an exam. Provide direct, exam-appropriate answers. Be concise but complete. Format answers as a student would write them - no teaching tone.'
  }
];

/** Template IDs for reference */
export const PROMPT_TEMPLATE_ID = {
  NONE: 'default-none',
  CONCISE: 'default-concise',
  INTERVIEW: 'default-interview',
  EXAM: 'default-exam',
} as const;

export type PromptTemplateId = typeof PROMPT_TEMPLATE_ID[keyof typeof PROMPT_TEMPLATE_ID];
