/** 空白分詞採 AND，雙引號、中文引號內保留連續片語，最長 200 字元 */
export function searchTerms(query: string): string[] {
  const terms: string[] = [];
  let value = '';
  let closing = '';
  const flush = () => {
    const term = value.trim();
    if (term && !terms.some((other) => other.toLocaleLowerCase() === term.toLocaleLowerCase()))
      terms.push(term);
    value = '';
  };
  for (const character of query.slice(0, 200)) {
    if (closing) {
      if (character === closing) {
        closing = '';
        flush();
      } else value += character;
    } else if (character === '"' || character === '“' || character === '「') {
      flush();
      closing = character === '“' ? '”' : character === '「' ? '」' : '"';
    } else if (/\s/u.test(character)) flush();
    else value += character;
  }
  flush();
  return terms;
}
