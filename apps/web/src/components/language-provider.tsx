"use client";

import { ChevronDown, Languages } from "lucide-react";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export type AppLanguage = "en" | "es" | "ru" | "zh";

export type CombinationCopy = {
  readonly label: string;
  readonly formation: string;
  readonly response: string;
};

type GuideStepCopy = {
  readonly title: string;
  readonly body: string;
};

type RuleFlowCopy = {
  readonly eyebrow: string;
  readonly title: string;
  readonly body: string;
};

type LanguageCopy = {
  readonly language: string;
  readonly howToPlay: string;
  readonly hub: {
    readonly title: string;
    readonly bots: string;
    readonly casual: string;
    readonly ranked: string;
    readonly cups: string;
    readonly cosmetics: string;
  };
  readonly welcome: {
    readonly headline: string;
    readonly body: string;
    readonly enter: string;
    readonly learn: string;
  };
  readonly guide: {
    readonly quickStart: string;
    readonly title: string;
    readonly demoLabel: string;
    readonly demoBody: string;
    readonly flows: readonly RuleFlowCopy[];
    readonly steps: readonly GuideStepCopy[];
    readonly combinationsEyebrow: string;
    readonly combinationsTitle: string;
    readonly combinationsBody: string;
    readonly completeRules: string;
    readonly practice: string;
    readonly enterLobby: string;
  };
  readonly rules: {
    readonly title: string;
    readonly noRoom: string;
    readonly trickHeading: string;
    readonly trickExplanation: string;
    readonly rankOrder: string;
    readonly classicSuitOrder: string;
    readonly arenaSuitOrder: string;
    readonly lowestHighest: (highestCard: string) => string;
    readonly combinationsHeading: string;
    readonly core: readonly string[];
    readonly combinations: Record<
      "single" | "pair" | "trips" | "quad" | "full-house" | "straight" | "bomb",
      CombinationCopy
    >;
    readonly arena: readonly string[];
    readonly bombEnds: string;
    readonly bombContinues: string;
    readonly trade: string;
  };
  readonly table: {
    readonly chat: string;
    readonly rules: string;
    readonly invite: string;
    readonly leave: string;
    readonly close: string;
  };
};

const LANGUAGE_STORAGE_KEY = "deuces-arena-language";

export const LANGUAGE_OPTIONS: readonly {
  readonly value: AppLanguage;
  readonly label: string;
  readonly shortLabel: string;
}[] = [
  { value: "en", label: "English", shortLabel: "EN" },
  { value: "es", label: "Español", shortLabel: "ES" },
  { value: "ru", label: "Русский", shortLabel: "RU" },
  { value: "zh", label: "简体中文", shortLabel: "中文" }
];

export const LANGUAGE_COPY: Record<AppLanguage, LanguageCopy> = {
  en: {
    language: "Language",
    howToPlay: "How to Play",
    hub: {
      title: "Choose a Table",
      bots: "Bots",
      casual: "Casual",
      ranked: "Ranked",
      cups: "Cups",
      cosmetics: "Shop & Locker"
    },
    welcome: {
      headline: "Take your seat.",
      body: "Shed every card before your opponents. The lowest card opens the match; smart timing closes it.",
      enter: "Enter Arena",
      learn: "Learn the Game"
    },
    guide: {
      quickStart: "Quick start",
      title: "Learn Deuces in 60 seconds",
      demoLabel: "Lead, beat, or pass",
      demoBody: "The next play must use the same hand type and rank higher.",
      flows: [
        {
          eyebrow: "Center is empty",
          title: "Lead any valid hand",
          body: "You choose whether this trick uses singles, pairs, trips, quads, a full house, or a straight."
        },
        {
          eyebrow: "Cards are in the center",
          title: "Match it or pass",
          body: "Play a higher hand of the same type. A bomb is the only hand that may break the pattern."
        },
        {
          eyebrow: "Everyone else passes",
          title: "Clear and lead again",
          body: "The last player to play wins that trick. The center clears and they choose the next type."
        }
      ],
      steps: [
        {
          title: "The match starts with 3♦",
          body: "Whoever holds the 3 of diamonds takes the first turn. Their opening combination must contain 3♦."
        },
        {
          title: "The lead sets the type",
          body: "A single must be answered by a higher single, a pair by a higher pair, and every other normal hand by the same type."
        },
        {
          title: "Play higher or pass",
          body: "When answering a play, you may pass. If another player continues the trick, your turn may come around again. You cannot pass when leading."
        },
        {
          title: "Win the trick, then the match",
          body: "When everyone else passes, the last player leads a fresh trick. The first player with no cards wins."
        }
      ],
      combinationsEyebrow: "Every legal combination",
      combinationsTitle: "What you can play",
      combinationsBody:
        "You may lead with any hand below. Everyone must then use that same row until the trick ends, except when a bomb is played.",
      completeRules: "Complete turn rules",
      practice: "Start Guided Practice",
      enterLobby: "Enter Lobby"
    },
    rules: {
      title: "Rules",
      noRoom: "No active room",
      trickHeading: "How a trick works",
      trickExplanation:
        "Empty center: lead any valid combination. Cards in the center: play a higher hand of the same type or pass. When nobody beats the last play, its player clears the center and leads again.",
      rankOrder: "Rank order",
      classicSuitOrder: "Diamonds, clubs, hearts, spades from low to high.",
      arenaSuitOrder: "Diamonds, clubs, hearts, spades, stars, crowns from low to high.",
      lowestHighest: (highestCard) => `3 of diamonds is lowest; ${highestCard} is highest.`,
      combinationsHeading: "Legal combinations",
      core: [
        "A match is made of tricks. A new trick begins whenever the center is empty.",
        "The player holding 3 of diamonds leads first, and the opening play must include that card.",
        "The leader may play any supported combination. That choice sets the hand type for the trick.",
        "After the lead, play a higher hand of the same type or pass. Straights must match the exact length.",
        "A bomb is the exception: it may interrupt any normal hand.",
        "When nobody beats the last play, that player clears the center and leads the next trick.",
        "The first player to empty their hand wins the match."
      ],
      combinations: {
        single: {
          label: "Single",
          formation: "Any one card.",
          response: "Beat it with one higher card."
        },
        pair: {
          label: "Pair (double)",
          formation: "Two cards of the same rank.",
          response: "Beat it with a higher pair."
        },
        trips: {
          label: "Trips",
          formation: "Three cards of the same rank.",
          response: "Beat it with higher trips."
        },
        quad: {
          label: "Quad",
          formation: "Four cards of the same rank.",
          response: "Beat it with a higher quad."
        },
        "full-house": {
          label: "Full house",
          formation: "Trips plus a pair.",
          response: "Beat it with a higher set of trips."
        },
        straight: {
          label: "Straight",
          formation: "Five or more consecutive ranks. A 2 cannot be used.",
          response: "Use a higher straight of exactly the same length."
        },
        bomb: {
          label: "Bomb",
          formation: "Four of a kind plus one extra card.",
          response: "Beats a normal hand; only a higher bomb beats it."
        }
      },
      arena: [
        "Arena 6 uses 78 cards. Pairs, trips, and quads may use any combination of six suits.",
        "Five or six cards of one rank are not separate hands. Bombs remain four matching cards plus one kicker."
      ],
      bombEnds: "A bomb immediately ends the trick; no stronger bomb may answer.",
      bombContinues: "After a bomb, only a stronger bomb may answer.",
      trade:
        "Casual trade variant: humans have 20 seconds before the first move to complete one one-for-one trade."
    },
    table: { chat: "Chat", rules: "Rules", invite: "Invite", leave: "Leave", close: "Close" }
  },
  es: {
    language: "Idioma",
    howToPlay: "Cómo jugar",
    hub: {
      title: "Elige una mesa",
      bots: "Bots",
      casual: "Casual",
      ranked: "Clasificatoria",
      cups: "Copas",
      cosmetics: "Tienda y colección"
    },
    welcome: {
      headline: "Toma asiento.",
      body: "Quédate sin cartas antes que tus rivales. La carta más baja abre la partida; elegir bien el momento la gana.",
      enter: "Entrar a la arena",
      learn: "Aprender a jugar"
    },
    guide: {
      quickStart: "Inicio rápido",
      title: "Aprende Deuces en 60 segundos",
      demoLabel: "Inicia, supera o pasa",
      demoBody: "La siguiente jugada debe usar el mismo tipo de mano y ser más alta.",
      flows: [
        {
          eyebrow: "El centro está vacío",
          title: "Inicia con una mano válida",
          body: "Elige una carta, pareja, trío, póquer, full house o escalera."
        },
        {
          eyebrow: "Hay cartas en el centro",
          title: "Supéralas o pasa",
          body: "Juega una mano más alta del mismo tipo. Solo una bomba puede romper el patrón."
        },
        {
          eyebrow: "Todos los demás pasan",
          title: "Limpia e inicia otra vez",
          body: "La última persona que jugó gana la baza y elige el siguiente tipo."
        }
      ],
      steps: [
        {
          title: "La partida empieza con 3♦",
          body: "Quien tenga el 3 de diamantes juega primero. Su combinación inicial debe contener 3♦."
        },
        {
          title: "La primera jugada fija el tipo",
          body: "Una carta se responde con una carta más alta, una pareja con otra pareja y así con cada mano normal."
        },
        {
          title: "Juega más alto o pasa",
          body: "Al responder puedes pasar. Si la baza continúa, puede volver a tocarte. No puedes pasar cuando te toca iniciar."
        },
        {
          title: "Gana la baza y luego la partida",
          body: "Cuando todos pasan, la última persona inicia una baza nueva. Gana quien se queda sin cartas."
        }
      ],
      combinationsEyebrow: "Todas las combinaciones",
      combinationsTitle: "Qué puedes jugar",
      combinationsBody:
        "Puedes iniciar con cualquier mano de abajo. Después todos deben usar ese mismo tipo, excepto con una bomba.",
      completeRules: "Reglas completas del turno",
      practice: "Iniciar práctica guiada",
      enterLobby: "Entrar al lobby"
    },
    rules: {
      title: "Reglas",
      noRoom: "No hay una sala activa",
      trickHeading: "Cómo funciona una baza",
      trickExplanation:
        "Centro vacío: inicia con cualquier combinación válida. Con cartas en el centro: juega una mano más alta del mismo tipo o pasa. Si nadie supera la última jugada, esa persona limpia el centro e inicia otra vez.",
      rankOrder: "Orden de valores",
      classicSuitOrder: "Diamantes, tréboles, corazones y picas, de menor a mayor.",
      arenaSuitOrder:
        "Diamantes, tréboles, corazones, picas, estrellas y coronas, de menor a mayor.",
      lowestHighest: (highestCard) => `El 3 de diamantes es la menor; ${highestCard} es la mayor.`,
      combinationsHeading: "Combinaciones válidas",
      core: [
        "Una partida se divide en bazas. Una baza nueva empieza cuando el centro está vacío.",
        "Quien tenga el 3 de diamantes empieza, y la primera jugada debe incluir esa carta.",
        "Quien inicia puede jugar cualquier combinación válida y fija el tipo de mano de la baza.",
        "Después, juega una mano más alta del mismo tipo o pasa. Las escaleras deben tener la misma longitud.",
        "Una bomba es la excepción y puede superar cualquier mano normal.",
        "Si nadie supera la última jugada, esa persona limpia el centro e inicia la siguiente baza.",
        "Gana la primera persona que se queda sin cartas."
      ],
      combinations: {
        single: {
          label: "Una carta",
          formation: "Cualquier carta.",
          response: "Supérala con una carta más alta."
        },
        pair: {
          label: "Pareja",
          formation: "Dos cartas del mismo valor.",
          response: "Supérala con una pareja más alta."
        },
        trips: {
          label: "Trío",
          formation: "Tres cartas del mismo valor.",
          response: "Supéralo con un trío más alto."
        },
        quad: {
          label: "Póquer",
          formation: "Cuatro cartas del mismo valor.",
          response: "Supéralo con un póquer más alto."
        },
        "full-house": {
          label: "Full house",
          formation: "Un trío y una pareja.",
          response: "Se compara por el valor del trío."
        },
        straight: {
          label: "Escalera",
          formation: "Cinco o más valores consecutivos. El 2 no se usa.",
          response: "Usa una escalera más alta de la misma longitud."
        },
        bomb: {
          label: "Bomba",
          formation: "Cuatro iguales y una carta extra.",
          response: "Supera una mano normal; solo una bomba mayor la vence."
        }
      },
      arena: [
        "Arena 6 usa 78 cartas. Parejas, tríos y póquer pueden combinar cualquiera de los seis palos.",
        "Cinco o seis cartas iguales no forman una mano distinta. La bomba sigue siendo cuatro iguales y una carta extra."
      ],
      bombEnds: "Una bomba termina la baza de inmediato; no se puede responder.",
      bombContinues: "Después de una bomba, solo una bomba más alta puede responder.",
      trade:
        "Variante casual: hay 20 segundos antes de la primera jugada para completar un intercambio de una carta por otra."
    },
    table: { chat: "Chat", rules: "Reglas", invite: "Invitar", leave: "Salir", close: "Cerrar" }
  },
  ru: {
    language: "Язык",
    howToPlay: "Как играть",
    hub: {
      title: "Выберите стол",
      bots: "Боты",
      casual: "Обычная",
      ranked: "Рейтинг",
      cups: "Кубки",
      cosmetics: "Магазин"
    },
    welcome: {
      headline: "Займите место.",
      body: "Избавьтесь от всех карт раньше соперников. Самая младшая карта открывает игру, а правильный момент приносит победу.",
      enter: "Войти в игру",
      learn: "Научиться играть"
    },
    guide: {
      quickStart: "Быстрый старт",
      title: "Deuces за 60 секунд",
      demoLabel: "Ходите, перебивайте или пасуйте",
      demoBody: "Следующий ход должен быть того же типа, но старше.",
      flows: [
        {
          eyebrow: "Центр пуст",
          title: "Сыграйте любую комбинацию",
          body: "Выберите одиночную карту, пару, тройку, каре, фул-хаус или стрит."
        },
        {
          eyebrow: "В центре лежат карты",
          title: "Перебейте или пасуйте",
          body: "Сыграйте более старшую комбинацию того же типа. Только бомба меняет правило."
        },
        {
          eyebrow: "Все остальные спасовали",
          title: "Очистите стол и ходите снова",
          body: "Последний сыгравший выигрывает взятку и выбирает новый тип."
        }
      ],
      steps: [
        {
          title: "Игра начинается с 3♦",
          body: "Первым ходит игрок с тройкой бубен. Первая комбинация должна содержать 3♦."
        },
        {
          title: "Первый ход задаёт тип",
          body: "Одиночную карту перебивают одиночной, пару — парой, и так далее для каждой обычной комбинации."
        },
        {
          title: "Перебейте или пасуйте",
          body: "Отвечая на ход, можно спасовать. Ход может снова вернуться к вам. Нельзя пасовать, когда вы начинаете взятку."
        },
        {
          title: "Выиграйте взятку, затем игру",
          body: "Когда все спасовали, последний сыгравший начинает новую взятку. Побеждает тот, у кого первым закончатся карты."
        }
      ],
      combinationsEyebrow: "Все комбинации",
      combinationsTitle: "Что можно сыграть",
      combinationsBody:
        "Начать можно с любой комбинации ниже. Затем все играют тот же тип до конца взятки, кроме бомбы.",
      completeRules: "Полные правила хода",
      practice: "Начать обучение",
      enterLobby: "Войти в лобби"
    },
    rules: {
      title: "Правила",
      noRoom: "Нет активной комнаты",
      trickHeading: "Как проходит взятка",
      trickExplanation:
        "Пустой центр: сыграйте любую допустимую комбинацию. Карты в центре: сыграйте более старшую комбинацию того же типа или пасуйте. Если никто не перебил последний ход, его игрок очищает центр и ходит снова.",
      rankOrder: "Порядок карт",
      classicSuitOrder: "Бубны, трефы, червы, пики — от младшей масти к старшей.",
      arenaSuitOrder: "Бубны, трефы, червы, пики, звёзды, короны — от младшей масти к старшей.",
      lowestHighest: (highestCard) => `3 бубен — младшая карта; ${highestCard} — старшая.`,
      combinationsHeading: "Допустимые комбинации",
      core: [
        "Матч состоит из взяток. Новая взятка начинается, когда центр пуст.",
        "Первым ходит игрок с 3 бубен, и первый ход должен включать эту карту.",
        "Начинающий играет любую допустимую комбинацию и задаёт тип взятки.",
        "Далее сыграйте более старшую комбинацию того же типа или пасуйте. Длина стрита должна совпадать.",
        "Бомба — исключение: она перебивает любую обычную комбинацию.",
        "Если никто не перебил последний ход, этот игрок очищает центр и начинает новую взятку.",
        "Побеждает игрок, который первым избавится от всех карт."
      ],
      combinations: {
        single: {
          label: "Одна карта",
          formation: "Любая одна карта.",
          response: "Перебейте одной более старшей картой."
        },
        pair: {
          label: "Пара",
          formation: "Две карты одного достоинства.",
          response: "Перебейте более старшей парой."
        },
        trips: {
          label: "Тройка",
          formation: "Три карты одного достоинства.",
          response: "Перебейте более старшей тройкой."
        },
        quad: {
          label: "Каре",
          formation: "Четыре карты одного достоинства.",
          response: "Перебейте более старшим каре."
        },
        "full-house": {
          label: "Фул-хаус",
          formation: "Тройка и пара.",
          response: "Сравнивается достоинство тройки."
        },
        straight: {
          label: "Стрит",
          formation: "Пять или больше последовательных достоинств. 2 не используется.",
          response: "Сыграйте более старший стрит той же длины."
        },
        bomb: {
          label: "Бомба",
          formation: "Каре и одна дополнительная карта.",
          response: "Перебивает обычную комбинацию; только старшая бомба перебьёт её."
        }
      },
      arena: [
        "В Arena 6 используется 78 карт. Пары, тройки и каре могут включать любые из шести мастей.",
        "Пять или шесть одинаковых карт не являются отдельной комбинацией. Бомба — это ровно каре и одна дополнительная карта."
      ],
      bombEnds: "Бомба сразу завершает взятку; ответить более старшей бомбой нельзя.",
      bombContinues: "После бомбы можно ответить только более старшей бомбой.",
      trade:
        "Обычный режим с обменом: до первого хода у игроков есть 20 секунд на один обмен картой."
    },
    table: { chat: "Чат", rules: "Правила", invite: "Пригласить", leave: "Выйти", close: "Закрыть" }
  },
  zh: {
    language: "语言",
    howToPlay: "玩法说明",
    hub: {
      title: "选择牌桌",
      bots: "电脑",
      casual: "休闲",
      ranked: "排位",
      cups: "杯赛",
      cosmetics: "商店与收藏"
    },
    welcome: {
      headline: "入座吧。",
      body: "比对手更早打光所有牌。最小的牌开启比赛，正确的时机赢得比赛。",
      enter: "进入竞技场",
      learn: "学习玩法"
    },
    guide: {
      quickStart: "快速入门",
      title: "60 秒学会锄大地",
      demoLabel: "领出、压过或跳过",
      demoBody: "下一手必须使用相同牌型，并且点数更高。",
      flows: [
        {
          eyebrow: "桌面为空",
          title: "领出任意合法牌型",
          body: "你可以选择单张、对子、三条、四条、葫芦或顺子。"
        },
        {
          eyebrow: "桌面已有牌",
          title: "压过或跳过",
          body: "打出更大的同类牌型。只有炸弹可以打破牌型限制。"
        },
        {
          eyebrow: "其他玩家都跳过",
          title: "清空桌面并重新领出",
          body: "最后出牌的玩家赢得本轮，并选择下一轮牌型。"
        }
      ],
      steps: [
        { title: "比赛从方块 3 开始", body: "持有方块 3 的玩家先出，第一手组合必须包含方块 3。" },
        {
          title: "领出决定牌型",
          body: "单张只能用更大的单张压，对子只能用更大的对子压，其他普通牌型同理。"
        },
        {
          title: "压过或跳过",
          body: "回应出牌时可以跳过；本轮继续后还可能再次轮到你。领出时不能跳过。"
        },
        {
          title: "先赢本轮，再赢比赛",
          body: "其他人都跳过后，最后出牌者开启新一轮。最先打光手牌者获胜。"
        }
      ],
      combinationsEyebrow: "所有合法组合",
      combinationsTitle: "可以出的牌型",
      combinationsBody: "你可以用下列任意牌型领出。之后本轮必须保持相同牌型，炸弹除外。",
      completeRules: "完整回合规则",
      practice: "开始引导练习",
      enterLobby: "进入大厅"
    },
    rules: {
      title: "规则",
      noRoom: "没有进行中的房间",
      trickHeading: "一轮如何进行",
      trickExplanation:
        "桌面为空：领出任意合法组合。桌面有牌：打出更大的同类牌型或跳过。无人压过最后一手时，该玩家清空桌面并重新领出。",
      rankOrder: "点数顺序",
      classicSuitOrder: "方块、梅花、红桃、黑桃，由小到大。",
      arenaSuitOrder: "方块、梅花、红桃、黑桃、星星、皇冠，由小到大。",
      lowestHighest: (highestCard) => `方块 3 最小；${highestCard} 最大。`,
      combinationsHeading: "合法牌型",
      core: [
        "一场比赛由多轮组成。桌面为空时开始新一轮。",
        "持有方块 3 的玩家先出，第一手必须包含方块 3。",
        "领出者可以打出任意支持的组合，并决定本轮牌型。",
        "之后必须打出更大的同类牌型或跳过。顺子的张数必须完全相同。",
        "炸弹是例外：它可以压过任何普通牌型。",
        "无人压过最后一手时，该玩家清空桌面并开启下一轮。",
        "最先打光手牌的玩家获胜。"
      ],
      combinations: {
        single: { label: "单张", formation: "任意一张牌。", response: "用一张更大的牌压过。" },
        pair: { label: "对子", formation: "两张相同点数。", response: "用更大的对子压过。" },
        trips: { label: "三条", formation: "三张相同点数。", response: "用更大的三条压过。" },
        quad: { label: "四条", formation: "四张相同点数。", response: "用更大的四条压过。" },
        "full-house": {
          label: "葫芦",
          formation: "一个三条加一个对子。",
          response: "比较三条的点数。"
        },
        straight: {
          label: "顺子",
          formation: "五张或更多连续点数，不能使用 2。",
          response: "用张数相同且更大的顺子压过。"
        },
        bomb: {
          label: "炸弹",
          formation: "四条加任意一张额外牌。",
          response: "压过普通牌型；只有更大的炸弹能压过。"
        }
      },
      arena: [
        "Arena 6 使用 78 张牌。对子、三条和四条可以由六种花色任意组合。",
        "五张或六张同点数不算独立牌型。炸弹仍是四张同点数加一张额外牌。"
      ],
      bombEnds: "炸弹立即结束本轮，不能再用更大的炸弹回应。",
      bombContinues: "炸弹之后只能用更大的炸弹回应。",
      trade: "休闲交换规则：第一手之前有 20 秒时间，每位真人玩家最多完成一次一对一换牌。"
    },
    table: { chat: "聊天", rules: "规则", invite: "邀请", leave: "离开", close: "关闭" }
  }
};

type LanguageContextValue = {
  readonly language: AppLanguage;
  readonly copy: LanguageCopy;
  readonly setLanguage: (language: AppLanguage) => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { readonly children: ReactNode }) {
  const [language, setLanguage] = useState<AppLanguage>("en");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    setLanguage(isAppLanguage(saved) ? saved : detectBrowserLanguage());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    document.documentElement.lang = language === "zh" ? "zh-CN" : language;
  }, [language, loaded]);

  const value = useMemo(
    () => ({ language, copy: LANGUAGE_COPY[language], setLanguage }),
    [language]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (context === null) throw new Error("useLanguage must be used inside LanguageProvider");
  return context;
}

export function LanguageSelector({
  className,
  compact = false
}: {
  readonly className?: string;
  readonly compact?: boolean;
}) {
  const { copy, language, setLanguage } = useLanguage();

  return (
    <label
      className={cn(
        "relative flex h-10 min-w-0 items-center rounded-full border border-white/10 bg-black/30 text-zinc-200 transition focus-within:border-[var(--aqua)]",
        className
      )}
      title={copy.language}
    >
      <Languages
        className={cn(
          "pointer-events-none absolute size-4 text-[var(--aqua)]",
          compact ? "left-2" : "left-3"
        )}
      />
      <span className="sr-only">{copy.language}</span>
      <select
        aria-label={copy.language}
        className={cn(
          "h-full w-full appearance-none truncate bg-transparent py-0 text-xs font-black outline-none",
          compact ? "pl-6 pr-4" : "pl-9 pr-8"
        )}
        value={language}
        onChange={(event) => setLanguage(event.target.value as AppLanguage)}
      >
        {LANGUAGE_OPTIONS.map((option) => (
          <option key={option.value} className="bg-zinc-950" value={option.value}>
            {compact ? option.shortLabel : option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className={cn(
          "pointer-events-none absolute size-3.5 text-zinc-500",
          compact ? "right-1" : "right-2.5"
        )}
      />
    </label>
  );
}

function detectBrowserLanguage(): AppLanguage {
  const browserLanguage = window.navigator.language.toLowerCase();
  if (browserLanguage.startsWith("es")) return "es";
  if (browserLanguage.startsWith("ru")) return "ru";
  if (browserLanguage.startsWith("zh")) return "zh";
  return "en";
}

function isAppLanguage(value: string | null): value is AppLanguage {
  return value === "en" || value === "es" || value === "ru" || value === "zh";
}
