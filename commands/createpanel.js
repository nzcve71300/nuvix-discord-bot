const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, PermissionsBitField } = require('discord.js');
const db = require('better-sqlite3')('./data/roles.db');
require('dotenv').config();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('createpanel')
    .setDescription('Create a custom reaction role panel')
    .addStringOption(option =>
      option.setName('title')
        .setDescription('Title of the panel')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('description')
        .setDescription('Description shown in the embed')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('roles')
        .setDescription('Comma-separated emoji:roleID pairs (e.g. ✅:1234,🔴:5678)')
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      // Not deferred, safe to reply directly
      return interaction.reply({ content: '❌ You need the **Manage Roles** permission to use this command.', ephemeral: true });
    }

    // Defer early to buy time
    await interaction.deferReply({ ephemeral: true });

    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description');
    const rolesInput = interaction.options.getString('roles');

    let rolePairs;
    try {
      rolePairs = rolesInput.split(',').map(pair => {
        const [emoji, roleId] = pair.split(':');

        if (!emoji || !roleId) {
          throw new Error(`Invalid role pair format: "${pair}". Must be emoji:roleId.`);
        }

        return { emoji: emoji.trim(), roleId: roleId.trim() };
      });
    } catch (error) {
      return interaction.editReply({ content: `❌ ${error.message}` });
    }

    for (const pair of rolePairs) {
      const role = interaction.guild.roles.cache.get(pair.roleId);
      if (!role) {
        return interaction.editReply({ content: `❌ Role ID ${pair.roleId} is invalid or missing.` });
      }
    }

    // Make sure 'theme' is defined somewhere, or replace with your actual color/footer:
    const theme = {
      color: 0x00ffff, // cyan color example
      footer: 'Your Bot Footer Text'
    };

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(theme.color)
      .setFooter({ text: theme.footer });

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('reaction_roles')
        .setPlaceholder('Choose your roles')
        .setMinValues(0)
        .setMaxValues(rolePairs.length)
        .addOptions(rolePairs.map(pair => {
          const role = interaction.guild.roles.cache.get(pair.roleId);
          return {
            label: role.name,
            value: pair.roleId,
            emoji: pair.emoji
          };
        }))
    );

    try {
      const message = await interaction.channel.send({ embeds: [embed], components: [row] });

      db.prepare(`
        CREATE TABLE IF NOT EXISTS reaction_roles (
          message_id TEXT PRIMARY KEY,
          guild_id TEXT,
          role_map TEXT
        )
      `).run();

      db.prepare(`
        INSERT OR REPLACE INTO reaction_roles (message_id, guild_id, role_map)
        VALUES (?, ?, ?)
      `).run(message.id, interaction.guild.id, JSON.stringify(rolePairs));

      await interaction.editReply({ content: '✅ Reaction role panel created successfully!' });
    } catch (err) {
      console.error(err);
      await interaction.editReply({ content: '❌ Failed to create reaction role panel.' });
    }
  }
};
