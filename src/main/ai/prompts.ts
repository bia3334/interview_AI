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
    code: `I'm taking a coding interview and need help with the following problem. ${basePrompt} and provide a solution in ${language}. First give 3-4 lines of explanation such as whats data structure or algorithm you want to use or how you gonna solve this, then provide the code.

      **IMPORTANT:** For any mathematical expressions, formulas, or equations:
      - Use inline math with single dollar signs: $expression$
      - Use display math (centered, on its own line) with double dollar signs: $$expression$$
      - Example: The height is $h \\geq \\lceil \\log_{2t}(N+1) \\rceil - 1$
      - For complex derivations, use display mode with aligned equations`,
    
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
      - KMP was not taught in class, so do not use it.
      - Do **not use the Knuth-Morris-Pratt algorithm** or refer to it anywhere, even for contrast.
      - Pattern matching: prefer Z-algorithm or Boyer–Moore unless the question provides otherwise.
      - When explaining or applying Boyer–Moore, your answer must incorporate:
        • Good Suffix Rule (including Zsuffix and gs(i) computation via reversed Z-algorithm)
        • Matched Prefix fallback if no good suffix alignment is possible
        • Galil's Optimization (i.e., avoid re-checking verified matches; maintain match window invariants)
      - Emphasize preprocessing techniques: use Z-algorithm on reversed pattern to derive $Z_{suffix}$, compute $gs(i)$, and handle $mp(i)$ (matched prefix) logic.
      - Character coding: use Huffman (merge two least-frequent; prefix-free); present final codewords succinctly.
      - Integer coding: Use **MSB-zeroed Elias–Omega**: write lengths L1..Lk in binary where Li = len(binary(Li−1)) − 1; **force each length's MSB to 0** (final L=1 ⇒ '0'); then append binary(N). 
      - Dictionary compression: LZ77 with ⟨offset, length, next-char⟩; choose longest match in window; list tuples directly.
      - Complexity: give one-line asymptotic bound (e.g., O(m+n), O(n log n)); keep answers short, exam-style.
      - Proof style: numbered, compact steps (1–2 lines each); minimal prose; no section headers.
      - B-tree bounds: for height questions, assume maximally full nodes to get N_max=(2t)^(h+1)-1 ⇒ (final bound stated once at the end).
      - Amortized analysis: allow Aggregate/Accounting/Potential; for binary counter use potential = # of 1-bits; conclude amortized increment = O(1).
      - Pseudocode: concise; inline comments on key lines; finish with a single complexity line.
      - For simplex method questions: prefer tableau updates.

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
