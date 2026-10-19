const INTERNAL_BARCODE_PREFIX = "29";

const getModulo10CheckDigit = (value: string) => {
  const sum = value
    .split("")
    .reverse()
    .reduce((total, digit, index) => {
      const multiplier = index % 2 === 0 ? 3 : 1;
      return total + Number(digit) * multiplier;
    }, 0);

  return String((10 - (sum % 10)) % 10);
};

export const generateInternalBarcode = () => {
  const timestampPart = Date.now().toString().slice(-7);
  const randomPart = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
  const body = `${INTERNAL_BARCODE_PREFIX}${timestampPart}${randomPart}`;

  return `${body}${getModulo10CheckDigit(body)}`;
};
