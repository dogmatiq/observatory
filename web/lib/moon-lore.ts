/** Something said or written about the moon, with where it can be read. */
export interface MoonQuote {
	/** The words, in their own language, with the lines of a poem separated by a newline. */
	text: string;

	/** The language that the words are in. */
	language: string;

	/**
	 * What the author called the moon, as it was said in their time, if the words
	 * are not in English, such as "Luna" for the poet of Rome.
	 */
	moon?: string;

	/** The words in English, if they are in another language. */
	translation?: {
		text: string;

		/** Who translated them and when, such as "Jane Doe, 1920". */
		by: string;
	};

	/** Who said or wrote it. */
	by: string;

	/** Where it was said or written, such as the title of the work. */
	work: string;

	/** The page of the primary source, which is the text of the work itself. */
	url: string;

	/**
	 * How often it is picked compared with a quote that has no weight, which is
	 * once for each of the others. Quotes that are by one speaker, and that should be
	 * shown as if they were one quote, share that between them: each of the three of
	 * a character's has a third.
	 */
	weight?: number;
}

/**
 * Some things said or written about the moon, each checked against the text that it
 * links to. A quote that could not be checked is not here, and neither is one that
 * is not in English and has no published translation.
 */
export const moonQuotes: readonly MoonQuote[] = [
	{
		text: "Magnificent desolation.",
		language: "English",
		by: "Buzz Aldrin",
		work: "Apollo 11 Lunar Surface Journal, 109:43:24",
		url: "https://apollojournals.org/alsj/a11/a11.step.html",
	},
	{
		text: "The vast loneliness up here of the Moon is awe inspiring, and it makes you realize just what you have back there on Earth.",
		language: "English",
		by: "Jim Lovell",
		work: "Apollo 8 Flight Journal, 085:46:23",
		url: "https://apollojournals.org/afj/ap08fj/21day4_orbit9.html",
	},
	{
		text: "And, as we leave the Moon at Taurus-Littrow, we leave as we came and, God willing, as we shall return, with peace and hope for all mankind.",
		language: "English",
		by: "Gene Cernan",
		work: "Apollo 17 Lunar Surface Journal, 170:41:00",
		url: "https://apollojournals.org/alsj/a17/a17.clsout3.html",
	},
	{
		text: "Everyone is a moon, and has a dark side which he never shows to anybody.",
		language: "English",
		by: "Mark Twain",
		work: "Following the Equator, 1897, a chapter epigraph",
		url: "https://twain.lib.virginia.edu/wilson/pwequat.html",
	},
	{
		text: "O, swear not by the moon, th’ inconstant moon,\nThat monthly changes in her circled orb,\nLest that thy love prove likewise variable.",
		language: "English",
		by: "William Shakespeare",
		work: "Romeo and Juliet, act 2, scene 2",
		url: "https://www.folger.edu/explore/shakespeares-works/romeo-and-juliet/read/2-2/",
	},
	{
		text: "The moving Moon went up the sky,\nAnd no where did abide:\nSoftly she was going up,\nAnd a star or two beside—",
		language: "English",
		by: "Samuel Taylor Coleridge",
		work: "The Rime of the Ancient Mariner, 1798",
		url: "https://web.viu.ca/johnstoi/poems/coleridge2.htm",
	},
	{
		text: "En kárielto eldain Isil, hildin Úr-anar.",
		language: "Quenya",
		moon: "Isil",
		translation: {
			text: "For Elves they made the Moon, but for Men the red Sun.",
			by: "J. R. R. Tolkien",
		},
		by: "J. R. R. Tolkien",
		work: "Fíriel’s Song, in The Lost Road and Other Writings, 1987, page 72",
		url: "https://ardalambion.net/firiel.htm",
	},
	{
		text: "O graziosa luna, io mi rammento\nche, or volge l’anno, sovra questo colle\nio venia pien d’angoscia a rimirarti:",
		language: "Italian",
		moon: "Luna",
		translation: {
			text: "O lovely moon, how well do I recall\nThe time,--'tis just a year--when up this hill\nI came, in my distress, to gaze at thee:",
			by: "Frederick Townsend, 1887",
		},
		by: "Giacomo Leopardi",
		work: "Alla luna, in Canti, 1819",
		url: "https://it.wikisource.org/wiki/Canti_(Leopardi_-_Ginzburg)/Alla_luna",
	},
	{
		text: "condito mitis placidusque telo\nsupplices audi pueros, Apollo;\nsiderum regina bicornis, audi,\nLuna, puellas.",
		language: "Latin",
		moon: "Luna",
		translation: {
			text: 'O lay thy shafts, Apollo, by!\nLet suppliant youths obtain thine ear!\nThou Moon, fair "regent of the sky,"\nThy maidens hear!',
			by: "John Conington, 1872",
		},
		by: "Horace",
		work: "Carmen Saeculare, 17 BC",
		url: "https://la.wikisource.org/wiki/Carmen_saeculare",
	},
	{
		text: "O ka mahina nui a Kane.\nO ka La nui a Kane.",
		language: "Hawaiian",
		moon: "Mahina",
		translation: {
			text: "The great moon of Kane,\nThe great sun of Kane,",
			by: "The Fornander Collection, 1920",
		},
		by: "A Hawaiian creation chant, collected by Abraham Fornander",
		work: "Fornander Collection of Hawaiian Antiquities and Folk-lore, volume 6, 1919–1920, page 364",
		url: "https://archive.org/details/FornanderCollection/page/n391",
	},
	{
		text: "Amuia le masina, e alu ma sau",
		language: "Samoan",
		moon: "Masina",
		translation: {
			text: "Blessed is the moon which goes and returns! Men die and return not.",
			by: "George Pratt, 1893",
		},
		by: "A Samoan proverb, collected by George Pratt",
		work: "A Grammar and Dictionary of the Samoan Language, 1893, page 50",
		url: "https://archive.org/details/agrammaranddict00pratgoog/page/n62",
	},
	{
		text: "Nareszcie księżyc srebrną pochodnię zaniecił,\nWyszedł z boru, i niebo i ziemię oświecił.",
		language: "Polish",
		moon: "Księżyc",
		translation: {
			text: "Finally the moon lighted her silver torch, came forth from the wood, and illumined both sky and land.",
			by: "George Rapall Noyes, 1917",
		},
		by: "Adam Mickiewicz",
		work: "Pan Tadeusz, 1834, book 8",
		url: "https://pl.wikisource.org/wiki/Pan_Tadeusz_(wyd._1921)/Ksi%C4%99ga_%C3%B3sma:_Zajazd",
	},
	{
		text: "Gealach na gconnlach, an ghealach is gile 'san mbliadhain.",
		language: "Irish",
		moon: "Gealach",
		translation: {
			text: "The stubble moon is the brightest moon in the year.",
			by: "Énrí Ó Muirgheasa, 1907",
		},
		by: "An Ulster proverb, collected by Énrí Ó Muirgheasa",
		work: "Seanfhocla Uladh, 1907, proverb 1219",
		url: "https://archive.org/details/seanfhoclauladh00muuoft/page/n227/mode/1up",
	},
	{
		text: "Munakashi inakishiweyo,\nNa sahani hung'ara ja mwezi.",
		language: "Swahili",
		moon: "Mwezi",
		translation: {
			text: "Engraved with engravings,\nAnd a dish shining like the moon.",
			by: "Edward Steere, 1870",
		},
		by: "A Swahili dance song, collected by Edward Steere",
		work: "Swahili Tales, 1870, page 478",
		url: "https://archive.org/details/swahilitalesasto00stee/page/n497/mode/1up",
	},
	{
		text: "Bani, u njengempisi; yona ya lahla itambo, ya bamba ize, ngokubona inyanga i semanzini.",
		language: "Zulu",
		moon: "Inyanga",
		translation: {
			text: "So-and-so, you are like the hyena; it threw away the bone, and caught at nothing, because it saw the moon in the water.",
			by: "Henry Callaway, 1868",
		},
		by: "A Zulu tale, collected by Henry Callaway",
		work: "Nursery Tales, Traditions, and Histories of the Zulus, 1868, page 358",
		url: "https://archive.org/details/nurserytalestrad00call_0/page/n379/mode/1up",
	},
	{
		text: "Seht ihr den Mond dort stehen? —\nEr ist nur halb zu sehen,\nUnd ist doch rund und schön!",
		language: "German",
		moon: "Mond",
		translation: {
			text: "Look up; the moon to-night\nShows us but half her light,\nAnd yet we know her round and fair.",
			by: "Catherine Winkworth, 1855",
		},
		by: "Matthias Claudius",
		work: "Abendlied, in Asmus omnia sua secum portans, 1782",
		url: "https://de.wikisource.org/wiki/Abendlied_(Matthias_Claudius)",
	},
	{
		text: "Сквозь волнистые туманы\nПробирается луна,\nНа печальные поляны\nЛьет печально свет она.",
		language: "Russian",
		moon: "Луна",
		translation: {
			text: "Breaking thro' the waving fogs\nForth the moon is coming,\nAnd on the gloomy acres\nShe gloomy light is shedding.",
			by: "Ivan Panin, 1888",
		},
		by: "Alexander Pushkin",
		work: "Winter Road, 1826",
		url: "https://ru.wikisource.org/wiki/%D0%97%D0%B8%D0%BC%D0%BD%D1%8F%D1%8F_%D0%B4%D0%BE%D1%80%D0%BE%D0%B3%D0%B0_(%D0%9F%D1%83%D1%88%D0%BA%D0%B8%D0%BD)",
	},
	{
		text: 'Мјесец кара звијезду даницу:\n"Ђе си била, звијездо данице?\nЂе си била, ђе си дангубила?\nДангубила три бијела дана?"',
		language: "Serbian",
		moon: "Мјесец",
		translation: {
			text: 'HARK! the moon is to the day-star calling:\n"Morning star! say, where hast thou been wandering;\nTell me where thou hast so long been lingering;\nWhere hast white days three so wasted,—tell me?"',
			by: "John Bowring, 1827",
		},
		by: "A Serbian folk poem",
		work: "Диоба Јакшића",
		url: "https://sr.wikisource.org/wiki/%D0%94%D0%B8%D0%BE%D0%B1%D0%B0_%D0%88%D0%B0%D0%BA%D1%88%D0%B8%D1%9B%D0%B0",
	},
	{
		text: "Deja a la luna verme con luz tranquila y suave;\nDeja que el alba envíe su resplandor fugaz,",
		language: "Spanish",
		moon: "Luna",
		translation: {
			text: "Let the moon beam over me soft and serene,\nLet the dawn shed over me its radiant flashes,",
			by: "Charles Derbyshire, in Austin Craig’s Lineage, Life and Labors of José Rizal, 1913",
		},
		by: "José Rizal",
		work: "Mi último adiós, 1896",
		url: "https://es.wikisource.org/wiki/Mi_%C3%BAltimo_adi%C3%B3s",
	},
	{
		text: "La lune blanche\nLuit dans les bois ;\nDe chaque branche\nPart une voix",
		language: "French",
		moon: "Lune",
		translation: {
			text: "The white moon sits\nAnd seems to brood\nWhere a swift voice flits\nFrom each branch in the wood",
			by: "Arthur Symons, in The Symbolist Movement in Literature, 1919",
		},
		by: "Paul Verlaine",
		work: "La lune blanche, in La Bonne Chanson, 1870",
		url: "https://fr.wikisource.org/wiki/La_Bonne_Chanson_(1902)/%C2%AB%20La%20lune%20blanche%20%C2%BB",
	},
	{
		text: "Awhea te puta ai te marama upoko taona?",
		language: "Māori",
		moon: "Marama",
		translation: {
			text: "When will the moon make its cooked head appear?",
			by: "Richard Taylor, 1855",
		},
		by: "A Māori curse, recorded by Richard Taylor",
		work: "Te Ika a Maui, 1855",
		url: "https://archive.org/details/teikaamauiornew01taylgoog",
	},
	{
		text: "Neil Armstrong, walking on my face.\nBuzz Aldrin, he walking on my face.\nAnd then the third one is a space man, walking on my face.\nAll on the surfaces, and they're looking at all of the stuff that the moon has got to offer. Heh heh... yeah.",
		language: "English",
		by: "The Moon, played by Noel Fielding",
		work: "The Mighty Boosh, “Call of the Yeti”, 2005, a poem",
		url: "https://www.springfieldspringfield.co.uk/view_episode_scripts.php?tv-show=the-mighty-boosh-2003&episode=s02e01",
		weight: 1 / 3,
	},
	{
		text: "When you are the moon, there is a person people say is the sun.\nI saw the sun once, it came past me, really fast\nand it was called the eclipse.\nAnd it came past, but as it came past I licked his back.",
		language: "English",
		by: "The Moon, played by Noel Fielding",
		work: "The Mighty Boosh, “The Priest and the Beast”, 2005",
		url: "https://www.springfieldspringfield.co.uk/view_episode_scripts.php?tv-show=the-mighty-boosh-2003&episode=s02e02",
		weight: 1 / 3,
	},
	{
		text: "One time, I saw a man looking at me, yes, with his eyes,\nand then he picked up a tube\nand he look in the tube\nand he made the moon big inside the tube.",
		language: "English",
		by: "The Moon, played by Noel Fielding",
		work: "The Mighty Boosh, “Nanageddon”, 2005",
		url: "https://www.springfieldspringfield.co.uk/view_episode_scripts.php?tv-show=the-mighty-boosh-2003&episode=s02e03",
		weight: 1 / 3,
	},
];

/**
 * pickOther returns one of the items at random, but not the one that is given, so
 * that picking again always gives something else. An item is picked in proportion
 * to its weight, which is 1 if it has none. If there is only one item, it is that
 * one.
 */
export function pickOther<T extends { weight?: number }>(
	items: readonly T[],
	not: T | undefined,
): T {
	const others = items.length > 1 ? items.filter((i) => i !== not) : items;

	let left =
		Math.random() * others.reduce((sum, i) => sum + (i.weight ?? 1), 0);
	for (const item of others) {
		left -= item.weight ?? 1;
		if (left < 0) {
			return item;
		}
	}

	return others[others.length - 1] as T;
}
