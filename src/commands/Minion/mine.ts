import { CommandStore, KlasaMessage } from 'klasa';

import { BotCommand } from '../../lib/BotCommand';
import {
	determineScaledOreTime,
	stringMatches,
	formatDuration,
	rand,
	itemNameFromID
} from '../../lib/util';
import Mining from '../../lib/skills/mining';
import { SkillsEnum } from '../../lib/types';
import { Time, Activity, Tasks } from '../../lib/constants';
import { MiningActivityTaskOptions } from '../../lib/types/minions';
import addSubTaskToActivityTask from '../../lib/util/addSubTaskToActivityTask';
import itemID from '../../lib/util/itemID';
import { UserSettings } from '../../lib/UserSettings';
import bankHasItem from '../../lib/util/bankHasItem';

const pickaxes = [
	{
		id: itemID('3rd age pickaxe'),
		reductionPercent: 13
	},
	{
		id: itemID('Gilded pickaxe'),
		reductionPercent: 11
	},
	{
		id: itemID('Infernal pickaxe'),
		reductionPercent: 10
	},
	{
		id: itemID('Dragon pickaxe'),
		reductionPercent: 6
	}
];

export default class extends BotCommand {
	public constructor(store: CommandStore, file: string[], directory: string) {
		super(store, file, directory, {
			altProtection: true,
			oneAtTime: true,
			cooldown: 1,
			usage: '<quantity:int{1}|name:...string> [name:...string]',
			usageDelim: ' '
		});
	}

	async run(msg: KlasaMessage, [quantity, name = '']: [null | number | string, string]) {
		if (!msg.author.hasMinion) {
			throw `You dont have a minion`;
		}

		if (msg.author.minionIsBusy) {
			return msg.send(msg.author.minionStatus);
		}

		if (typeof quantity === 'string') {
			name = quantity;
			quantity = null;
		}

		const ore = Mining.Ores.find(
			ore => stringMatches(ore.name, name) || stringMatches(ore.name.split(' ')[0], name)
		);

		if (!ore) {
			throw `Thats not a valid ore to mine. Valid ores are ${Mining.Ores.map(
				ore => ore.name
			).join(', ')}.`;
		}

		if (msg.author.skillLevel(SkillsEnum.Mining) < ore.level) {
			throw `${msg.author.minionName} needs ${ore.level} Mining to mine ${ore.name}.`;
		}

		// Calculate the time it takes to mine a single ore of this type, at this persons level.
		let timeToMine = determineScaledOreTime(
			ore!.xp,
			ore.respawnTime,
			msg.author.skillLevel(SkillsEnum.Mining)
		);

		// For each pickaxe, if they have it, give them its' bonus and break.
		const bank = msg.author.settings.get(UserSettings.Bank);
		const boosts = [];
		if (msg.author.skillLevel(SkillsEnum.Mining) >= 61) {
			for (const pickaxe of pickaxes) {
				if (bankHasItem(bank, pickaxe.id)) {
					timeToMine = Math.floor(timeToMine * ((100 - pickaxe.reductionPercent) / 100));
					boosts.push(`${pickaxe.reductionPercent}% for ${itemNameFromID(pickaxe.id)}`);
					break;
				}
			}
		}

		// If no quantity provided, set it to the max.
		if (quantity === null) {
			quantity = Math.floor((Time.Minute * 30) / timeToMine);
		}
		const duration = quantity * timeToMine;

		if (duration > Time.Minute * 30) {
			throw `${
				msg.author.minionName
			} can't go on trips longer than 30 minutes, try a lower quantity. The highest amount of ${
				ore.name
			} you can mine is ${Math.floor((Time.Minute * 30) / timeToMine)}.`;
		}

		const data: MiningActivityTaskOptions = {
			oreID: ore.id,
			userID: msg.author.id,
			channelID: msg.channel.id,
			quantity,
			duration,
			type: Activity.Mining,
			id: rand(1, 10_000_000),
			finishDate: Date.now() + duration
		};

		await addSubTaskToActivityTask(this.client, Tasks.SkillingTicker, data);
		msg.author.incrementMinionDailyDuration(duration);

		let response = `${msg.author.minionName} is now mining ${quantity}x ${
			ore.name
		}, it'll take around ${formatDuration(duration)} to finish.`;

		if (boosts.length > 0) {
			response += `\n\n **Boosts:** ${boosts.join(', ')}.`;
		}

		return msg.send(response);
	}
}
