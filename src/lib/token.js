// Bearer token persistence — Better-Auth's `bearer()` plugin issues the token
// in the `set-auth-token` response header on every successful sign-in (and in
// the body of email/social sign-in responses). We stash it in localStorage so
// reloads don't drop the session and downstream API helpers can attach it.

const TOKEN_KEY = "abugida.token";

const listeners = new Set();

export const getToken = () => localStorage.getItem(TOKEN_KEY) ?? "";

export const setToken = (value) => {
  if (value) {
    localStorage.setItem(TOKEN_KEY, value);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
  for (const fn of listeners) fn(value);
};

export const onTokenChange = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
