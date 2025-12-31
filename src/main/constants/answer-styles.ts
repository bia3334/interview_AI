/**
 * Answer style configuration for AI responses
 */

export const ANSWER_STYLE = {
  CODE: 'code',
  EXPLANATION: 'explanation',
  MULTIPLE_CHOICE: 'multiple-choice',
} as const;

export type AnswerStyle = typeof ANSWER_STYLE[keyof typeof ANSWER_STYLE];

/** All answer styles in order for cycling */
export const ANSWER_STYLES: AnswerStyle[] = [
  ANSWER_STYLE.CODE,
  ANSWER_STYLE.EXPLANATION,
  ANSWER_STYLE.MULTIPLE_CHOICE,
];

/** Default answer style */
export const DEFAULT_ANSWER_STYLE: AnswerStyle = ANSWER_STYLE.EXPLANATION;

/** Default programming language */
export const DEFAULT_LANGUAGE = 'python';
