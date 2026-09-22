import { buildMcpServerInstructions } from 'src/engine/api/mcp/utils/build-mcp-server-instructions.util';

describe('buildMcpServerInstructions', () => {
  it('presents Myah as the workspace product without changing dynamic capabilities', () => {
    const instructions = buildMcpServerInstructions(
      'people, companies',
      'campaign-management',
    );

    expect(instructions).toContain('Myah CRM workspace');
    expect(instructions).toContain('Myah primitives:');
    expect(instructions).toContain("never for Myah's own data");
    expect(instructions).toContain('Available objects: people, companies.');
    expect(instructions).toContain('Available skills: campaign-management.');
    expect(instructions).not.toContain('Twenty CRM workspace');
    expect(instructions).not.toContain('Twenty primitives:');
  });

  it('teaches the Creator model without advertising schema authoring', () => {
    const instructions = buildMcpServerInstructions(
      'creators, social_profiles, notes, note_targets',
      'myah-creators',
    );

    expect(instructions).toContain('Creator is the canonical person record');
    expect(instructions).toContain(
      'SocialProfile stores per-platform identity and metrics',
    );
    expect(instructions).toContain('NoteTarget');
    expect(instructions).toContain('get_object_metadata');
    expect(instructions).toContain('get_field_metadata');
    expect(instructions).not.toContain('person.companyId');
    expect(instructions).not.toContain('create_object_metadata');
    expect(instructions).not.toContain('update_object_metadata');
    expect(instructions).not.toContain('delete_field_metadata');
    expect(instructions).not.toContain('metadata tools without loading');
  });
});
