function isDigits(value: string): boolean {
  return /^\d+$/.test(value);
}

function isValidTckn(value: string): boolean {
  if (value.length !== 11 || !isDigits(value) || value[0] === '0') {
    return false;
  }
  const digits = value.split('').map(Number);
  const oddSum = digits[0] + digits[2] + digits[4] + digits[6] + digits[8];
  const evenSum = digits[1] + digits[3] + digits[5] + digits[7];
  const digit10 = (oddSum * 7 - evenSum) % 10;
  if ((digit10 + 10) % 10 !== digits[9]) {
    return false;
  }
  const first10Sum = digits.slice(0, 10).reduce((sum, d) => sum + d, 0);
  return first10Sum % 10 === digits[10];
}

function isValidVkn(value: string): boolean {
  if (value.length !== 10 || !isDigits(value)) {
    return false;
  }
  const digits = value.split('').map(Number);
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const tmp = (digits[i] + (9 - i)) % 10;
    let d: number;
    if (tmp === 0) {
      d = 0;
    } else {
      d = (tmp * 2 ** (9 - i)) % 9;
      if (d === 0) {
        d = 9;
      }
    }
    sum += d;
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === digits[9];
}

/** 10 haneli VKN veya 11 haneli TCKN algoritmik dogrulamasi. */
export function isValidTaxNumber(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 11) {
    return isValidTckn(trimmed);
  }
  if (trimmed.length === 10) {
    return isValidVkn(trimmed);
  }
  return false;
}
