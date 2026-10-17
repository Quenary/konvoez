import { describe, it, expect } from 'vitest';
import { EPermission } from '../enums';
import { createRoleSchema, updateRoleSchema, roleSchema } from './role.schemas';

describe('role.schemas', () => {
  it('validates a correct role creation payload', () => {
    const payload = {
      name: 'Moderator',
      color: '#3498db',
      priority: 50,
      isDefault: false,
      permissions: [EPermission.MANAGE_ROOMS, EPermission.MODERATE_MESSAGES],
    };

    const parsed = createRoleSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
  });

  it('fails creation when name is empty', () => {
    const payload = {
      name: '   ',
      permissions: [],
    };

    const parsed = createRoleSchema.safeParse(payload);
    expect(parsed.success).toBe(false);
  });

  it('fails when color is not a valid hex code', () => {
    const payload = {
      name: 'Invalid Color',
      color: 'red',
    };

    const parsed = createRoleSchema.safeParse(payload);
    expect(parsed.success).toBe(false);
  });

  it('validates partial role update payload', () => {
    const payload = {
      permissions: [EPermission.MANAGE_SETTINGS],
    };

    const parsed = updateRoleSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
  });

  it('validates complete role entity', () => {
    const entity = {
      id: 1,
      name: 'Admin',
      color: '#e74c3c',
      priority: 100,
      isDefault: false,
      permissions: Object.values(EPermission),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const parsed = roleSchema.safeParse(entity);
    expect(parsed.success).toBe(true);
  });
});
