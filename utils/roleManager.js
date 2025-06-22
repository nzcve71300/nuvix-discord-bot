const db = require('better-sqlite3')('./data/roles.db');
const { EmbedBuilder } = require('discord.js');
require('dotenv').config();

const theme = {
  color: '#00FFFF', // cyan fallback
};

module.exports = function setupReactionRoleHandlers(client) {
  client.on('interactionCreate', async interaction => {
    if (!interaction.isStringSelectMenu()) return;
    if (interaction.customId !== 'reaction_roles') return;

    const stored = db.prepare('SELECT * FROM reaction_roles WHERE message_id = ?').get(interaction.message.id);
    if (!stored) return;

    const roleMap = JSON.parse(stored.role_map);
    const roleIds = roleMap.map(r => r.roleId);

    const member = await interaction.guild.members.fetch(interaction.user.id);

    const toAdd = interaction.values;
    const toRemove = roleIds.filter(id => !toAdd.includes(id));

    try {
      for (const roleId of toRemove) {
        if (member.roles.cache.has(roleId)) {
          await member.roles.remove(roleId).catch(() => {});
        }
      }

      for (const roleId of toAdd) {
        if (!member.roles.cache.has(roleId)) {
          await member.roles.add(roleId).catch(() => {});
        }
      }

      await interaction.deferUpdate(); // acknowledges interaction without sending message

      // Optionally send ephemeral confirmation
      await interaction.followUp({
        ephemeral: true,
        embeds: [
          new EmbedBuilder()
            .setColor(theme.color)
            .setDescription('✅ Your roles have been updated successfully!')
        ]
      });
    } catch (err) {
      console.error(err);
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          ephemeral: true,
          content: '❌ There was an error updating your roles.'
        });
      } else {
        await interaction.reply({
          ephemeral: true,
          content: '❌ There was an error updating your roles.'
        });
      }
    }
  });
};
