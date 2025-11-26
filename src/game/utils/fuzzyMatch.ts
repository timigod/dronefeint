export const fuzzyMatchScore = (text: string, query: string): number => {
  if (!query) return 0;
  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();

  let score = 0;
  let haystackIndex = 0;

  for (let i = 0; i < needle.length; i++) {
    const char = needle[i];
    const foundIndex = haystack.indexOf(char, haystackIndex);
    if (foundIndex === -1) {
      return -1;
    }

    const distance = foundIndex - haystackIndex;
    score += distance === 0 ? 3 : Math.max(1.5 - distance * 0.1, 0.1);

    if (foundIndex === 0 || haystack[foundIndex - 1] === ' ') {
      score += 1;
    }

    haystackIndex = foundIndex + 1;
  }

  score += Math.min(2, needle.length / haystack.length);
  return score;
};
