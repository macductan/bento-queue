import { describe, it, expect } from 'vitest'
import { formatJavaScript } from '../jsFormatter'

describe('jsFormatter.ts', () => {
  it('formats unindented chained call with object parameter cleanly', () => {
    const input = `ha.folder('Backoffice').auth.env(ha.environment.name).set({
type: 'bearer',
value: ha.response.json().data.token
});`

    const expected = `ha.folder('Backoffice').auth.env(ha.environment.name).set({
  type: 'bearer',
  value: ha.response.json().data.token
});`

    expect(formatJavaScript(input)).toBe(expected)
  })

  it('formats if block and nested statements with proper indentation and operator spacing', () => {
    const input = `const token=ha.response.data?.token;
if(token){
ha.env().set({token:token});
console.log('Saved token');
}`

    const expected = `const token = ha.response.data?.token;
if (token) {
  ha.env().set({ token: token });
  console.log('Saved token');
}`

    expect(formatJavaScript(input)).toBe(expected)
  })

  it('preserves string literals with internal colons, commas, and quotes', () => {
    const input = `const url="https://api.com/users,test:123";
ha.request.headers.set('Authorization','Bearer '+token);`

    const expected = `const url = "https://api.com/users,test:123";
ha.request.headers.set('Authorization', 'Bearer ' + token);`

    expect(formatJavaScript(input)).toBe(expected)
  })

  it('preserves comments on their own line and at end of lines', () => {
    const input = `// Setup test auth
ha.folder().auth.set({
  type: 'bearer', // inline comment
  value: 'xyz'
});`

    expect(formatJavaScript(input)).toBe(input)
  })

  it('handles empty code and single-line code gracefully', () => {
    expect(formatJavaScript('')).toBe('')
    expect(formatJavaScript('   ')).toBe('   ')
    expect(formatJavaScript('const x=1;')).toBe('const x = 1;')
  })
})
