import { api } from './api';

export const cloneConfig = (config) => JSON.parse(JSON.stringify(config));

export const fetchYamlConfig = async () => {
  const response = await api.get('/api/system/config/yaml');
  return response.data;
};

export const saveYamlConfig = async (yamlContent) => {
  const response = await api.post('/api/system/config/yaml', { text: yamlContent });
  return response.data;
};
