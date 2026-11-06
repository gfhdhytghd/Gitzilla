/** Self-reported Canvas email; this does not verify identity or sign in to Canvas. */
export function normalizeClassroomEmail(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Enter your Canvas email address');
  const email = value.trim();
  if (email.length > 254 || !/^[A-Za-z0-9][A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]*@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(email)) {
    throw new Error('Enter a valid Canvas email address');
  }
  return email;
}
