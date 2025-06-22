const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, PermissionsBitField } = require('discord.js');
const db = require('better-sqlite3')('./data/roles.db');
require('dotenv').config();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('editpanel')
    .setDescription('Add roles to an existing reaction role panel')
    .addStringOption(option =>
      option.setName('messageid')
        .setDescription('ID of the panel message to edit')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('roles')
        .setDescription('Comma-separated emoji:roleID pairs to add (e.g. ✅:1234,🔴:5678)')
        .setRequired(true)),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      return interaction.reply({ content: '❌ You need the **Manage Roles** permission to use this command.', ephemeral: true });
    }

    const messageId = interaction.options.getString('messageid');
    const rolesInput = interaction.options.getString('roles');

    // Parse new roles input
    let newRolePairs;
    try {
      newRolePairs = rolesInput.split(',').map(pair => {
        const [emoji, roleId] = pair.split(':');
        if (!emoji || !roleId) throw new Error(`Invalid role pair format: "${pair}". Must be emoji:roleId.`);
        return { emoji: emoji.trim(), roleId: roleId.trim() };
      });
    } catch (error) {
      return interaction.reply({ content: `❌ ${error.message}`, ephemeral: true });
    }

    // Validate all new role IDs exist on the server
    for (const pair of newRolePairs) {
      const role = interaction.guild.roles.cache.get(pair.roleId);
      if (!role) {
        return interaction.reply({ content: `❌ Role ID ${pair.roleId} is invalid or missing.`, ephemeral: true });
      }
    }

    // Get existing panel data from DB
    const stored = db.prepare('SELECT * FROM reaction_roles WHERE message_id = ?').get(messageId);
    if (!stored) {
      return interaction.reply({ content: `❌ No reaction role panel found with message ID: ${messageId}`, ephemeral: true });
    }

    // Parse old roles and merge with new roles (avoid duplicates)
    const oldRoles = JSON.parse(stored.role_map);
    const combinedRolesMap = new Map();

    // Add old roles first
    for (const r of oldRoles) {
      combinedRolesMap.set(r.roleId, r.emoji);
    }
    // Add new roles or overwrite emoji if roleId already exists
    for (const r of newRolePairs) {
      combinedRolesMap.set(r.roleId, r.emoji);
    }

    // Create combined rolePairs array
    const combinedRolePairs = Array.from(combinedRolesMap.entries()).map(([roleId, emoji]) => ({ roleId, emoji }));

    // Fetch the channel and message to edit
    let message;
    try {
      // We don't store channel ID, so search all guild channels for the message
      // This is an expensive operation if the server is large; ideally you store channel ID in DB too.
      const channels = interaction.guild.channels.cache.filter(c => c.isTextBased());
      let foundMessage = null;

      for (const [, channel] of channels) {
        try {
          const fetchedMessage = await channel.messages.fetch(messageId);
          if (fetchedMessage) {
            foundMessage = fetchedMessage;
            break;
          }
        } catch {
          // ignore if message not found in this channel
        }
      }

      if (!foundMessage) {
        return interaction.reply({ content: `❌ Could not find message with ID ${messageId} in any text channel.`, ephemeral: true });
      }
      message = foundMessage;
    } catch (err) {
      console.error(err);
      return interaction.reply({ content: `❌ Error fetching message: ${err.message}`, ephemeral: true });
    }

    // Build new embed (keep old embed content)
    const oldEmbed = message.embeds[0];
    if (!oldEmbed) {
      return interaction.reply({ content: '❌ Original message does not have an embed.', ephemeral: true });
    }

    // Create new select menu options
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('reaction_roles')
      .setPlaceholder('Choose your roles')
      .setMinValues(0)
      .setMaxValues(combinedRolePairs.length)
      .addOptions(combinedRolePairs.map(pair => {
        const role = interaction.guild.roles.cache.get(pair.roleId);
        return {
          label: role.name,
          value: pair.roleId,
          emoji: pair.emoji
        };
      }));

    const row = new ActionRowBuilder().addComponents(selectMenu);

    // Edit the message with new components
    try {
      await message.edit({ components: [row] });
    } catch (err) {
      console.error(err);
      return interaction.reply({ content: `❌ Failed to edit the panel message: ${err.message}`, ephemeral: true });
    }

    // Update DB with combined roles
    try {
      db.prepare('UPDATE reaction_roles SET role_map = ? WHERE message_id = ?')
        .run(JSON.stringify(combinedRolePairs), messageId);
    } catch (err) {
      console.error(err);
      return interaction.reply({ content: `❌ Failed to update the database: ${err.message}`, ephemeral: true });
    }

    await interaction.reply({ content: `✅ Panel updated successfully! Added ${newRolePairs.length} role(s).`, ephemeral: true });
  }
};
