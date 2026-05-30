CREATE TABLE IF NOT EXISTS scale_devices (
  scale_device_id BIGINT NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  connection_type ENUM('SERIAL','TCP','USB') NOT NULL DEFAULT 'SERIAL',
  port_name VARCHAR(64) NOT NULL,
  baud_rate INT NOT NULL DEFAULT 9600,
  data_bits INT NOT NULL DEFAULT 8,
  stop_bits INT NOT NULL DEFAULT 1,
  parity_mode ENUM('NONE','EVEN','ODD') NOT NULL DEFAULT 'NONE',
  poll_delay_ms INT NOT NULL DEFAULT 150,
  command_sequence VARCHAR(64) DEFAULT NULL,
  use_carriage_return TINYINT(1) NOT NULL DEFAULT 0,
  parser_start INT DEFAULT NULL,
  parser_key_position INT DEFAULT NULL,
  parser_weight_position INT DEFAULT NULL,
  parser_weight_length INT DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (scale_device_id),
  UNIQUE KEY uq_scale_devices_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS article_profiles (
  article_profile_id BIGINT NOT NULL AUTO_INCREMENT,
  sicar_art_id INT NOT NULL,
  production_role ENUM('RAW_MATERIAL','FINISHED_GOOD','BYPRODUCT','CONSUMABLE','PACKAGING') NOT NULL DEFAULT 'RAW_MATERIAL',
  vrn_percentage DECIMAL(10,4) NOT NULL DEFAULT 0.0000,
  yield_target DECIMAL(20,4) DEFAULT NULL,
  costing_mode ENUM('SICAR_AVERAGE','SICAR_LAST_PURCHASE','VRN_PRODUCED','STANDARD','MANUAL') NOT NULL DEFAULT 'VRN_PRODUCED',
  manual_cost DECIMAL(20,6) DEFAULT NULL,
  is_scale_enabled TINYINT(1) NOT NULL DEFAULT 0,
  scale_device_id BIGINT DEFAULT NULL,
  characteristic_notes TEXT,
  extra_attributes LONGTEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (article_profile_id),
  UNIQUE KEY uq_article_profiles_sicar_art_id (sicar_art_id),
  KEY idx_article_profiles_role (production_role),
  CONSTRAINT fk_article_profiles_scale_devices
    FOREIGN KEY (scale_device_id) REFERENCES scale_devices (scale_device_id)
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS manual_cost_items (
  manual_cost_item_id BIGINT NOT NULL AUTO_INCREMENT,
  code VARCHAR(40) NOT NULL,
  name VARCHAR(160) NOT NULL,
  unit_name VARCHAR(16) NOT NULL,
  cost_type ENUM('LABOR','PACKAGING','UTILITY','INDIRECT','OTHER') NOT NULL DEFAULT 'OTHER',
  current_cost DECIMAL(20,6) NOT NULL DEFAULT 0.000000,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (manual_cost_item_id),
  UNIQUE KEY uq_manual_cost_items_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS recipes (
  recipe_id BIGINT NOT NULL AUTO_INCREMENT,
  code VARCHAR(40) NOT NULL,
  name VARCHAR(160) NOT NULL,
  version_no INT NOT NULL DEFAULT 1,
  batch_size DECIMAL(20,4) DEFAULT NULL,
  batch_unit VARCHAR(16) DEFAULT NULL,
  costing_method ENUM('VRN','WEIGHTED_AVERAGE','LAST_PURCHASE','STANDARD') NOT NULL DEFAULT 'VRN',
  status ENUM('DRAFT','ACTIVE','INACTIVE') NOT NULL DEFAULT 'DRAFT',
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (recipe_id),
  UNIQUE KEY uq_recipes_code_version (code, version_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS recipe_inputs (
  recipe_input_id BIGINT NOT NULL AUTO_INCREMENT,
  recipe_id BIGINT NOT NULL,
  line_order INT NOT NULL DEFAULT 1,
  sicar_art_id INT DEFAULT NULL,
  manual_cost_item_id BIGINT DEFAULT NULL,
  quantity DECIMAL(20,4) NOT NULL,
  unit_name VARCHAR(16) NOT NULL,
  waste_percentage DECIMAL(10,4) NOT NULL DEFAULT 0.0000,
  fixed_cost_amount DECIMAL(20,6) DEFAULT NULL,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (recipe_input_id),
  KEY idx_recipe_inputs_recipe_id (recipe_id),
  KEY idx_recipe_inputs_sicar_art_id (sicar_art_id),
  KEY idx_recipe_inputs_manual_cost_item_id (manual_cost_item_id),
  CONSTRAINT fk_recipe_inputs_recipe
    FOREIGN KEY (recipe_id) REFERENCES recipes (recipe_id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_recipe_inputs_manual_cost_items
    FOREIGN KEY (manual_cost_item_id) REFERENCES manual_cost_items (manual_cost_item_id)
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS recipe_outputs (
  recipe_output_id BIGINT NOT NULL AUTO_INCREMENT,
  recipe_id BIGINT NOT NULL,
  line_order INT NOT NULL DEFAULT 1,
  sicar_art_id INT NOT NULL,
  expected_quantity DECIMAL(20,4) NOT NULL,
  unit_name VARCHAR(16) NOT NULL,
  vrn_percentage DECIMAL(10,4) NOT NULL DEFAULT 0.0000,
  is_primary_output TINYINT(1) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (recipe_output_id),
  KEY idx_recipe_outputs_recipe_id (recipe_id),
  KEY idx_recipe_outputs_sicar_art_id (sicar_art_id),
  CONSTRAINT fk_recipe_outputs_recipe
    FOREIGN KEY (recipe_id) REFERENCES recipes (recipe_id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS production_orders (
  production_order_id BIGINT NOT NULL AUTO_INCREMENT,
  folio VARCHAR(50) NOT NULL,
  recipe_id BIGINT DEFAULT NULL,
  status ENUM('DRAFT','PLANNED','IN_PROGRESS','COMPLETED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
  costing_method ENUM('VRN','WEIGHTED_AVERAGE','LAST_PURCHASE','STANDARD') NOT NULL DEFAULT 'VRN',
  scheduled_at DATETIME DEFAULT NULL,
  started_at DATETIME DEFAULT NULL,
  completed_at DATETIME DEFAULT NULL,
  requested_by VARCHAR(120) DEFAULT NULL,
  approved_by VARCHAR(120) DEFAULT NULL,
  notes TEXT,
  costing_snapshot LONGTEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (production_order_id),
  UNIQUE KEY uq_production_orders_folio (folio),
  KEY idx_production_orders_recipe_id (recipe_id),
  CONSTRAINT fk_production_orders_recipe
    FOREIGN KEY (recipe_id) REFERENCES recipes (recipe_id)
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS production_order_inputs (
  production_order_input_id BIGINT NOT NULL AUTO_INCREMENT,
  production_order_id BIGINT NOT NULL,
  recipe_input_id BIGINT DEFAULT NULL,
  sicar_art_id INT DEFAULT NULL,
  manual_cost_item_id BIGINT DEFAULT NULL,
  planned_quantity DECIMAL(20,4) DEFAULT NULL,
  actual_quantity DECIMAL(20,4) DEFAULT NULL,
  unit_name VARCHAR(16) NOT NULL,
  unit_cost DECIMAL(20,6) DEFAULT NULL,
  total_cost DECIMAL(20,6) DEFAULT NULL,
  sicar_adjustment_id INT DEFAULT NULL,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (production_order_input_id),
  KEY idx_production_order_inputs_order_id (production_order_id),
  CONSTRAINT fk_production_order_inputs_order
    FOREIGN KEY (production_order_id) REFERENCES production_orders (production_order_id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_production_order_inputs_recipe_input
    FOREIGN KEY (recipe_input_id) REFERENCES recipe_inputs (recipe_input_id)
    ON UPDATE CASCADE,
  CONSTRAINT fk_production_order_inputs_manual_cost_items
    FOREIGN KEY (manual_cost_item_id) REFERENCES manual_cost_items (manual_cost_item_id)
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS production_order_outputs (
  production_order_output_id BIGINT NOT NULL AUTO_INCREMENT,
  production_order_id BIGINT NOT NULL,
  recipe_output_id BIGINT DEFAULT NULL,
  sicar_art_id INT NOT NULL,
  planned_quantity DECIMAL(20,4) DEFAULT NULL,
  actual_quantity DECIMAL(20,4) DEFAULT NULL,
  unit_name VARCHAR(16) NOT NULL,
  vrn_percentage DECIMAL(10,4) NOT NULL DEFAULT 0.0000,
  allocated_cost DECIMAL(20,6) DEFAULT NULL,
  produced_unit_cost DECIMAL(20,6) DEFAULT NULL,
  cost_update_mode ENUM('NONE','SICAR_AVERAGE','PRODUCED_COST_ONLY') NOT NULL DEFAULT 'SICAR_AVERAGE',
  sicar_adjustment_id INT DEFAULT NULL,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (production_order_output_id),
  KEY idx_production_order_outputs_order_id (production_order_id),
  CONSTRAINT fk_production_order_outputs_order
    FOREIGN KEY (production_order_id) REFERENCES production_orders (production_order_id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_production_order_outputs_recipe_output
    FOREIGN KEY (recipe_output_id) REFERENCES recipe_outputs (recipe_output_id)
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS production_movements (
  production_movement_id BIGINT NOT NULL AUTO_INCREMENT,
  production_order_id BIGINT NOT NULL,
  movement_type ENUM('CONSUMPTION','OUTPUT','COST_UPDATE','REVERSAL') NOT NULL,
  direction ENUM('OUT','IN','INFO') NOT NULL,
  sicar_adjustment_id INT DEFAULT NULL,
  status ENUM('PENDING','SIMULATED','APPLIED','FAILED') NOT NULL DEFAULT 'PENDING',
  movement_comment VARCHAR(255) NOT NULL,
  payload LONGTEXT,
  executed_at DATETIME DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (production_movement_id),
  KEY idx_production_movements_order_id (production_order_id),
  CONSTRAINT fk_production_movements_order
    FOREIGN KEY (production_order_id) REFERENCES production_orders (production_order_id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS audit_log (
  audit_log_id BIGINT NOT NULL AUTO_INCREMENT,
  entity_type VARCHAR(60) NOT NULL,
  entity_id BIGINT NOT NULL,
  action_type VARCHAR(60) NOT NULL,
  actor_name VARCHAR(120) DEFAULT NULL,
  details LONGTEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (audit_log_id),
  KEY idx_audit_log_entity (entity_type, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
