const randomstring = require('randomstring');

exports.generateOrderId = () =>
  Math.floor(100000000 + Math.random() * 900000000);

exports.generateWebToken = (number) => randomstring.generate(number || 24);


const classCodeMap = {
  'kg1': 'K1',
  'kg2': 'K2',
  'nursery1': 'N1',
  'nursery2': 'N2',
  'primary1': 'P1',
  'primary2': 'P2',
  'primary3': 'P3',
  'primary4': 'P4',
  'primary5': 'P5',
  'primary6': 'P6',
  'jss1': 'J1',
  'jss2': 'J2',
  'jss3': 'J3',
  'ss1': 'S1',
  'ss2': 'S2',
  'ss3': 'S3'
};

exports.classCodeMap = classCodeMap;

exports.applicationRef = (serial, className, yearAdmitted = new Date().getFullYear()) => {
  const classCode = classCodeMap[className.toLowerCase()] || 'XX';
  const year = String(yearAdmitted).slice(-2);
  const randomNum = Math.floor(10000 + Math.random() * 90000);

  return `${year}${classCode}${randomNum}${serial || ''}`;
};