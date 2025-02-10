import { errors } from 'oidc-provider';

const sanitiseEmail = (requestEmail: string) => {
  if (typeof requestEmail !== 'string') {
    throw new errors.InvalidRequest('Invalid email');
  }
  const email = requestEmail.trim().toLowerCase();
  if (
    requestEmail.length < 3 ||
    !requestEmail.includes('@') ||
    requestEmail.includes('"')
  ) {
    throw new errors.InvalidRequest('Invalid email');
  }
  const parts = requestEmail.split('@');
  if (parts.length !== 2 || parts[0].length < 1 || !parts[1].includes('.')) {
    throw new errors.InvalidRequest('Invalid email');
  }
  return email;
};

export { sanitiseEmail };
