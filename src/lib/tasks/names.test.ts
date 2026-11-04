import { describe, expect, it } from 'vitest';
import { chipName, firstName, personInitials } from './names';

describe('firstName', () => {
  it('uses the first word of full_name', () => {
    expect(firstName('Seed Admin')).toBe('Seed');
    expect(firstName('Ada Lovelace')).toBe('Ada');
  });

  it('falls back to the email local part', () => {
    expect(firstName(null, 'seed-helper@704collective.dev')).toBe('seed-helper');
    expect(firstName('   ', 'ada@example.com')).toBe('ada');
  });
});

describe('chipName', () => {
  it('never renders Seed Seed for a repeated first+last', () => {
    expect(chipName({ full_name: 'Seed Seed' })).toBe('Seed');
  });

  it('disambiguates two Seed first names', () => {
    const people = [{ full_name: 'Seed Admin' }, { full_name: 'Seed Helper' }];
    expect(chipName(people[0], people)).toBe('Seed Admin');
    expect(chipName(people[1], people)).toBe('Seed Helper');
  });
});

describe('personInitials', () => {
  it('uses first + last initials', () => {
    expect(personInitials('Seed Admin')).toBe('SA');
    expect(personInitials('Seed Helper')).toBe('SH');
    expect(personInitials('Ada Lovelace')).toBe('AL');
  });
});
