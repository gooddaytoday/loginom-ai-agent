// Inert until typed into the owned draft; these probes are never executed.
export const javascriptSourceSample = [
  '  // Проба точности: Ёж, кавычки " и backslash \\  ',
  'function exactSourceProbe() {',
  '\tif (true) {  ',
  '\t\tconst text = "Кириллица \\\\ \\"";  ',
  '    // '+ 'длинная строка '.repeat(24),
  '',
  '\t}',
  '}'
].join('\n');

const boundaryLines=['function boundarySourceProbe() {',...Array.from({length:1022},(_,i)=>'  // '+String(i).padStart(4,'0')+' Я'),'}'];
boundaryLines[1022]+=' '.repeat(32768-Buffer.byteLength(boundaryLines.join('\n'),'utf8'));
export const javascriptSourceBoundary=boundaryLines.join('\n');
