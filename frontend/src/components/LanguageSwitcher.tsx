import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Button,
} from '@chakra-ui/react';
import { ChevronDownIcon } from '@chakra-ui/icons';

const LANGUAGES = [
  { code: 'pt-BR', label: 'PT', flag: '🇧🇷' },
  { code: 'en', label: 'EN', flag: '🇺🇸' },
  { code: 'es', label: 'ES', flag: '🇪🇸' },
] as const;

export const LanguageSwitcher: React.FC = () => {
  const { i18n } = useTranslation();

  const current = LANGUAGES.find((l) => l.code === i18n.language) ?? LANGUAGES[0];

  return (
    <Menu>
      <MenuButton
        as={Button}
        variant="ghost"
        size="sm"
        rightIcon={<ChevronDownIcon />}
        fontWeight="medium"
        color="gray.600"
        _hover={{ color: 'blue.600', bg: 'gray.50' }}
      >
        {current.flag} {current.label}
      </MenuButton>
      <MenuList minW="120px">
        {LANGUAGES.map((lang) => (
          <MenuItem
            key={lang.code}
            onClick={() => i18n.changeLanguage(lang.code)}
            fontWeight={lang.code === i18n.language ? 'bold' : 'normal'}
            bg={lang.code === i18n.language ? 'gray.50' : undefined}
          >
            {lang.flag} {lang.label}
          </MenuItem>
        ))}
      </MenuList>
    </Menu>
  );
};
