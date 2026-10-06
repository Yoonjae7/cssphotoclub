// Memory only: every page load starts locked, including after a reload.
let token = '';
export function setBoothToken(value) { token = value; }
export function getBoothToken() { return token; }
