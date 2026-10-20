import { describe, it, expect } from 'vitest';
import { EPermission } from '../enums';
import { SCHEMA_ERROR } from './base.schemas';
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
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toBe(
        SCHEMA_ERROR.ROLE_NAME_REQUIRED,
      );
    }
  });

  it('fails creation when name exceeds 64 characters', () => {
    const payload = {
      name: 'a'.repeat(65),
      permissions: [],
    };

    const parsed = createRoleSchema.safeParse(payload);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toBe(
        SCHEMA_ERROR.ROLE_NAME_LENGTH,
      );
    }
  });

  it('fails when color is not a valid hex code', () => {
    const payload = {
      name: 'Invalid Color',
      color: 'red',
    };

    const parsed = createRoleSchema.safeParse(payload);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toBe(SCHEMA_ERROR.COLOR_HEX);
    }
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
    if (parsed.success) {
      expect(parsed.data.mentionable).toBe(false);
    }
  });

  it('handles mentionable field in create, update, and role entities', () => {
    const created = createRoleSchema.parse({
      name: 'Pingable',
      mentionable: true,
    });
    expect(created.mentionable).toBe(true);

    const defaultCreated = createRoleSchema.parse({
      name: 'Standard',
    });
    expect(defaultCreated.mentionable).toBe(false);

    const updated = updateRoleSchema.parse({
      mentionable: true,
    });
    expect(updated.mentionable).toBe(true);
  });
});
