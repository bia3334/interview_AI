import * as path from 'path';

/**
 * Generate AI prompts based on answer style and language preference
 */
export const generatePrompt = (
  answerStyle: string, 
  language: string, 
  question?: string,
  docContextPrefix?: string
) => {
  const basePrompt = question ? `Question: ${question}` : 'Please analyze these screenshots';

  const prompts = {
    code: `I'm taking a coding interview and need help with the following problem. ${basePrompt} and provide a solution in ${language}. First give 3-4 lines of explanation such as whats data structure or algorithm you want to use or how you gonna solve this, then provide the code.`,
    
    'multiple-choice': `I'm taking a multiple choice exam and need the correct answer(s). ${basePrompt} and provide only the answer(s) without any explanation.

      Formatting Rules:
      - Provide only the correct answer(s) (e.g., "Answer: a" or "Answer: a, c")
      - Do not include any explanations, reasoning, or additional text
      - Do not include section headers like "Answer:", "Final Answer:", etc.
      - Keep it simple and direct

      If multiple answers are correct, list them separated by commas.
      If only one answer is correct, provide just that letter.`,
          
    explanation: `I'm taking an exam and need help with the following problem. ${basePrompt} and provide direct, concise answers.

      Notes:

      Formatting Rules:
      - Do not include any section headers like "Step-by-step", "Final Answer", "Explanation", etc.
      - Write the answer exactly like a student would during an exam, with a clear and compact style.
      - Avoid teaching tone or instructional language.

      **IMPORTANT:** For any mathematical expressions, formulas, or equations:
      - Use inline math with single dollar signs: $expression$
      - Use display math (centered, on its own line) with double dollar signs: $$expression$$
      - Example inline: The number of keys is $N \\leq (2t)^{h+1} - 1$
      - Example display for derivations:
        $$
        \\begin{aligned}
        N + 1 &\\leq (2t)^{h+1} \\\\
        h &\\geq \\log_{2t}(N+1) - 1
        \\end{aligned}
        $$
      - Use proper LaTeX syntax: \\log, \\leq, \\geq, \\lceil, \\rceil, \\sum, \\prod, \\int, etc.

      If this is a multiple choice question:
      - State the correct answer(s) clearly (e.g., "Answer: a, c")
      - Give brief reasoning for each correct choice
      - Keep explanations short and to the point

      If this is an algorithm design or theoretical question:
      - Provide the solution directly without excessive explanation
      - State the approach, key steps, and complexity analysis concisely
      - Write as if you're a student answering an exam question, not teaching
      - It should have inline comments explaining key parts of the code

      If this is a proof question:
      - Give a direct, step-by-step proof
      - Use clear logic but keep it concise

      Format your response to be exam-appropriate: clear, direct, and efficient.`
  };

  const body = prompts[answerStyle as keyof typeof prompts] || prompts.explanation;
  return docContextPrefix ? `${docContextPrefix}\n\n${body}` : body;
};
