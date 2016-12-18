const responses = [
    'I eat blank karma for breakfast.',
    'A karma with every meal is good apparently.',
    'Thank-you for appreciating my efforts.',
    'Karma comes only to those you give it too.',
    'You are tosser.'
];

const initialise = (obj, property, defaultVal) => {
    if (!obj.hasOwnProperty(property)) {
        obj[property] = defaultVal;
    }
};

const parseKarmaChange = (message) => {
    const extracted = /(\+|-)\1*$/.exec(message),
        k = extracted[0].length - 1;
    return {
        karma: extracted[1] === '+' ? k : -k,
        name: message.substr(0, extracted.index).trim().toProperCase()
    };
};

const checkPerson = (karma, person) => {
	const ps = person.split(' '),
		ks = karma.split(' '),
		overlap = ps.filter(n => ks.indexOf(n) != -1);
	return overlap.length != 0;
};

const punish = (thread, person, karmaChange, reason) => {
    karmaChange.karma = Math.abs(karmaChange.karma);
    exports.config[thread][person].karma -= karmaChange.karma;
    exports.config[thread][person].quota += karmaChange.karma;
    return `${person} modified ${reason}. As punishment they now have ${exports.config[thread][person].karma} karma.`;
};

const modifyKarma = (karmaChange, person, thread) => {
    initialise(exports.config, thread, {});

	if (karmaChange.name.trim() === '') { // invalid karma change
        const index = Math.floor(Math.random() * responses.length);
		return `${responses[index]} Try again.`;
	}

    const currDate = new Date();
    initialise(exports.config[thread], person, {
        karma: 0,
        quota: 0,
        lastAlteredBy: '',
        lastAlteredCount: 0,
        lastAlteredTime: currDate,
        quotaStartTime: currDate
    });

    // migration path
    initialise(exports.config[thread][person], 'quotaStartTime', currDate);

    // reset karma timeout
	if (currDate - exports.config[thread][person].quotaStartTime > exports.config.karmaTimeLimit) {
		exports.config[thread][person].quotaStartTime = currDate;
		exports.config[thread][person].quota = 0;
	}

    // prevent changing karma until timelimit is over
	if (exports.config[thread][person].quota >= exports.config.karmaPerTimeLimit && !exports.config.allowAnyKarmaPerTimeLimit) {
        const endWait = new Date(exports.config[thread][person].quotaStartTime.getTime() + exports.config.karmaTimeLimit),
            tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unknown TZ/Outdated Node.js';
            endDt = `${endWait.toLocaleString()} (${tz})`;
		return `${person} has used their karma quota for today, please try again after ${endDt}.`;
	}

    // prevent changing own karma
    if (checkPerson(karmaChange.name, person) && !exports.config.allowSelfKarmaChange) {
        return punish(thread, person, karmaChange, 'their own karma');;
    }

    // prevent changing item karma too much
	if ((karmaChange.karma >= exports.config.karmaPerItem || karmaChange.karma <= -exports.config.karmaPerItem) && !exports.config.allowAnyKarmaPerItem) {
        return punish(thread, person, karmaChange, 'karma too much');
	}

    initialise(exports.config[thread], karmaChange.name, {
        karma: 0,
        lastAlteredBy: '',
        lastAlteredCount: 0,
        lastAlteredTime: null,
        quota: 0,
        quotaStartTime: null
    });

    // reset change timeout
	if (currDate - exports.config[thread][karmaChange.name].lastAlteredTime > exports.config.changeTimeLimit) {
		exports.config[thread][karmaChange.name].lastAlteredCount = 0;
	}

    // ensure one person doesn't change an items karma too often
	if (person === exports.config[thread][karmaChange.name].lastAlteredBy
        && exports.config[thread][karmaChange.name].lastAlteredCount > exports.config.changePerTimeLimit && !exports.config.allowAnyChangePerTimeLimit) {
        return punish(thread, person, karmaChange, `karma of ${karmaChange.name} too often`);
	}

	exports.config[thread][karmaChange.name].lastAlteredBy = person;
	exports.config[thread][karmaChange.name].lastAlteredCount =
		person === exports.config[thread][karmaChange.name].lastAlteredBy
        ? exports.config[thread][karmaChange.name].lastAlteredCount + 1
        : 1;
	exports.config[thread][karmaChange.name].lastAlteredTime = currDate;

	exports.config[thread][person].quota += Math.abs(karmaChange.karma);
	exports.config[thread][karmaChange.name].karma += karmaChange.karma;
	let response = `${karmaChange.name} now has ${exports.config[thread][karmaChange.name].karma} karma.`;
    if (exports.config[thread][person].quota + Math.abs(karmaChange.karma) >= exports.config.karmaPerTimeLimit && !exports.config.allowAnyKarmaPerTimeLimit) {
        response += `\n${person} has reached their karma limit for today.`;
    }
    return response;
};

const printKarma = (api, event) => {
	const karmas = exports.config[event.thread_id];
	let message = '';
	for (let k in karmas) {
		message += `${k} \t→ ${karmas[k].karma}\n`;
	}
	api.sendMessage((message === '' ? 'Somebody has failed to meet their meanness quota for the day. No karmas to show.' : message), event.thread_id);
};

exports.run = (api, event) => {
	if (event.body === api.commandPrefix + 'karma') {
		printKarma(api, event);
		return;
	}

	const karmaChange = parseKarmaChange(event.body),
        result = modifyKarma(karmaChange, event.sender_name.trim().toProperCase(), event.thread_id);
	api.sendMessage(result, event.thread_id);
};

exports.match = (event, commandPrefix) => {
	return event.body.endsWith('++') || event.body.endsWith('--') || event.arguments[0] === commandPrefix + 'karma';
};

exports.load = () => {
    initialise(exports.config, 'allowSelfKarmaChange', false);
    initialise(exports.config, 'karmaPerTimeLimit', 10);
    initialise(exports.config, 'karmaTimeLimit', 86400000); // 24hrs
    initialise(exports.config, 'allowAnyKarmaPerTimeLimit', false);
    initialise(exports.config, 'karmaPerItem', 5);
    initialise(exports.config, 'allowAnyKarmaPerItem', false);
    initialise(exports.config, 'changePerTimeLimit', 3);
    initialise(exports.config, 'changeTimeLimit', 120000); // 2 mins
    initialise(exports.config, 'allowAnyChangePerTimeLimit', false);

    // convert back to date objects
    for (let thread in exports.config) {
        for (let karmaItem in exports.config[thread]) {
            const item = exports.config[thread][karmaItem];
            if (item.lastAlteredTime && typeof(item.lastAlteredTime) === 'string') {
                item.lastAlteredTime = new Date(item.lastAlteredTime);
            }
            if (item.quotaStartTime && typeof(item.quotaStartTime) === 'string') {
                item.quotaStartTime = new Date(item.quotaStartTime);
            }
        }
    }
};
