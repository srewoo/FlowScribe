/**
 * FlowScribe Page Object Model Generator
 * Automatically generates Page Object Models from recorded interactions
 * Supports multiple testing frameworks with intelligent element grouping
 */

class PageObjectGenerator {
  constructor() {
    this.pageObjects = new Map();
    this.elementPatterns = {
      // Common UI patterns
      forms: {
        patterns: ['form', '[role="form"]', '.form', '#form'],
        elements: ['input', 'select', 'textarea', 'button[type="submit"]']
      },
      navigation: {
        patterns: ['nav', '[role="navigation"]', '.navbar', '.menu', '.nav'],
        elements: ['a', 'button', '[role="button"]']
      },
      modals: {
        patterns: ['.modal', '.dialog', '[role="dialog"]', '.popup'],
        elements: ['button', '.close', '.cancel', '.ok', '.submit']
      },
      tables: {
        patterns: ['table', '[role="table"]', '.table', '.data-table'],
        elements: ['th', 'td', 'tr', 'thead', 'tbody']
      },
      cards: {
        patterns: ['.card', '.item', '.tile', '.box'],
        elements: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'button', 'a']
      }
    };
    
    this.frameworks = {
      playwright: {
        pageClass: 'Page',
        locatorMethod: 'locator',
        imports: "import { Page, Locator, expect } from '@playwright/test';",
        fileExtension: '.ts'
      },
      selenium: {
        pageClass: 'WebDriver',
        locatorMethod: 'find_element',
        imports: "from selenium.webdriver.common.by import By\nfrom selenium.webdriver.support.ui import WebDriverWait\nfrom selenium.webdriver.support import expected_conditions as EC",
        fileExtension: '.py'
      },
      cypress: {
        pageClass: 'Cypress',
        locatorMethod: 'get',
        imports: '',
        fileExtension: '.js'
      },
      puppeteer: {
        pageClass: 'Page',
        locatorMethod: '$',
        imports: '',
        fileExtension: '.js'
      }
    };
  }

  /**
   * Generate Page Objects from recorded actions
   */
  async generatePageObjects(actions, framework = 'playwright', options = {}) {
    const pageMap = this.groupActionsByPage(actions);
    const pageObjects = [];

    for (const [url, pageActions] of pageMap) {
      const pageObject = await this.createPageObject(url, pageActions, framework, options);
      pageObjects.push(pageObject);
    }

    return {
      pageObjects,
      framework,
      testHelper: this.generateTestHelper(framework, pageObjects),
      basePageClass: this.generateBasePageClass(framework)
    };
  }

  /**
   * Group actions by page URL
   */
  groupActionsByPage(actions) {
    const pageMap = new Map();

    actions.forEach(action => {
      const pageUrl = this.normalizeUrl(action.url || window.location.href);
      
      if (!pageMap.has(pageUrl)) {
        pageMap.set(pageUrl, {
          url: pageUrl,
          actions: [],
          elements: new Map()
        });
      }

      const page = pageMap.get(pageUrl);
      page.actions.push(action);
      
      if (action.element) {
        const elementKey = this.generateElementKey(action.element);
        if (!page.elements.has(elementKey)) {
          page.elements.set(elementKey, {
            ...action.element,
            actions: []
          });
        }
        page.elements.get(elementKey).actions.push(action.type);
      }
    });

    return pageMap;
  }

  /**
   * Create a Page Object for a specific page
   */
  async createPageObject(url, pageData, framework, options) {
    const pageName = this.generatePageName(url);
    const className = `${pageName}Page`;
    
    const elements = this.analyzePageElements(pageData.elements);
    const sections = this.identifyPageSections(elements);
    const methods = this.generatePageMethods(pageData.actions, framework);

    return {
      className,
      filename: `${this.camelToKebab(pageName)}-page${this.frameworks[framework].fileExtension}`,
      url,
      elements,
      sections,
      methods,
      code: this.generatePageObjectCode(className, elements, sections, methods, framework, options)
    };
  }

  /**
   * Analyze and categorize page elements
   */
  analyzePageElements(elementsMap) {
    const elements = [];
    
    for (const [key, elementData] of elementsMap) {
      const element = {
        name: this.generateElementName(elementData),
        selector: elementData.selector || elementData.css || elementData.xpath,
        type: this.determineElementType(elementData),
        actions: [...new Set(elementData.actions)], // Remove duplicates
        section: this.determineElementSection(elementData),
        isRequired: elementData.actions.some(action => ['click', 'input', 'submit'].includes(action)),
        description: this.generateElementDescription(elementData)
      };
      
      elements.push(element);
    }

    return elements.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Identify logical sections within a page
   */
  identifyPageSections(elements) {
    const sections = new Map();

    elements.forEach(element => {
      const section = element.section || 'main';
      if (!sections.has(section)) {
        sections.set(section, {
          name: section,
          elements: [],
          methods: []
        });
      }
      sections.get(section).elements.push(element);
    });

    // Generate section-specific methods
    for (const [name, section] of sections) {
      section.methods = this.generateSectionMethods(section.elements, name);
    }

    return Array.from(sections.values());
  }

  /**
   * Generate page methods based on recorded actions
   */
  generatePageMethods(actions, framework) {
    const methods = [];
    const methodGroups = new Map();

    // Group actions by workflow patterns
    const workflows = this.identifyWorkflows(actions);
    
    workflows.forEach((workflow, name) => {
      methods.push(this.generateWorkflowMethod(name, workflow, framework));
    });

    // Generate individual element interaction methods
    const elementMethods = this.generateElementMethods(actions, framework);
    methods.push(...elementMethods);

    return methods;
  }

  /**
   * Identify common workflows from actions
   */
  identifyWorkflows(actions) {
    const workflows = new Map();
    
    // Login workflow detection
    const loginActions = actions.filter(action => 
      action.element && (
        action.element.name?.includes('username') ||
        action.element.name?.includes('email') ||
        action.element.name?.includes('password') ||
        action.element.type === 'password' ||
        (action.type === 'click' && action.element.textContent?.toLowerCase().includes('login'))
      )
    );
    
    if (loginActions.length >= 2) {
      workflows.set('login', {
        name: 'login',
        description: 'User login workflow',
        actions: loginActions,
        parameters: ['username', 'password']
      });
    }

    // Form submission workflow detection
    const formActions = actions.filter(action =>
      action.type === 'input' || action.type === 'select' || 
      (action.type === 'click' && action.element?.type === 'submit')
    );
    
    if (formActions.length >= 2) {
      workflows.set('fillForm', {
        name: 'fillForm',
        description: 'Fill and submit form',
        actions: formActions,
        parameters: this.extractFormParameters(formActions)
      });
    }

    // Search workflow detection
    const searchActions = actions.filter(action =>
      action.element && (
        action.element.name?.includes('search') ||
        action.element.placeholder?.toLowerCase().includes('search') ||
        action.element.role === 'searchbox'
      )
    );

    if (searchActions.length >= 1) {
      workflows.set('search', {
        name: 'search',
        description: 'Perform search operation',
        actions: searchActions,
        parameters: ['searchTerm']
      });
    }

    return workflows;
  }

  /**
   * Generate code for Page Object class
   */
  generatePageObjectCode(className, elements, sections, methods, framework, options = {}) {
    switch (framework) {
      case 'playwright':
        return this.generatePlaywrightPageObject(className, elements, sections, methods, options);
      case 'selenium':
        return this.generateSeleniumPageObject(className, elements, sections, methods, options);
      case 'cypress':
        return this.generateCypressPageObject(className, elements, sections, methods, options);
      case 'puppeteer':
        return this.generatePuppeteerPageObject(className, elements, sections, methods, options);
      default:
        throw new Error(`Unsupported framework: ${framework}`);
    }
  }

  /**
   * Generate Playwright Page Object
   */
  generatePlaywrightPageObject(className, elements, sections, methods, options) {
    const imports = this.frameworks.playwright.imports;
    
    const elementDeclarations = elements.map(el => 
      `  readonly ${el.name}: Locator;`
    ).join('\n');

    const constructorAssignments = elements.map(el =>
      `    this.${el.name} = page.locator('${el.selector}');`
    ).join('\n');

    const methodImplementations = methods.map(method =>
      this.generatePlaywrightMethod(method)
    ).join('\n\n');

    return `${imports}

/**
 * ${className} - Generated by FlowScribe
 * Page Object Model for ${className.replace('Page', '')} functionality
 */
export class ${className} {
  readonly page: Page;

${elementDeclarations}

  constructor(page: Page) {
    this.page = page;
${constructorAssignments}
  }

${methodImplementations}

  /**
   * Navigate to this page
   */
  async goto(url?: string): Promise<void> {
    await this.page.goto(url || this.getPageUrl());
  }

  /**
   * Wait for page to be loaded
   */
  async waitForLoad(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Get the current page URL
   */
  getPageUrl(): string {
    return '${this.getBaseUrlPlaceholder()}';
  }

  /**
   * Take a screenshot of this page
   */
  async screenshot(options?: { path?: string; fullPage?: boolean }): Promise<Buffer> {
    return await this.page.screenshot(options);
  }
}`;
  }

  /**
   * Generate Selenium Page Object (Python)
   */
  generateSeleniumPageObject(className, elements, sections, methods, options) {
    const imports = this.frameworks.selenium.imports;
    
    const elementDeclarations = elements.map(el => 
      `    @property
    def ${el.name}(self):
        """${el.description}"""
        return self.wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, '${el.selector}')))`
    ).join('\n\n');

    const methodImplementations = methods.map(method =>
      this.generateSeleniumMethod(method)
    ).join('\n\n');

    return `${imports}

class ${className}:
    """
    ${className} - Generated by FlowScribe
    Page Object Model for ${className.replace('Page', '')} functionality
    """
    
    def __init__(self, driver, timeout=10):
        self.driver = driver
        self.wait = WebDriverWait(driver, timeout)
        self.base_url = "${this.getBaseUrlPlaceholder()}"
    
${elementDeclarations}

${methodImplementations}

    def goto(self, url=None):
        """Navigate to this page"""
        target_url = url or self.base_url
        self.driver.get(target_url)
        
    def wait_for_load(self):
        """Wait for page to be loaded"""
        self.wait.until(EC.presence_of_element_located((By.TAG_NAME, "body")))
        
    def take_screenshot(self, filename=None):
        """Take a screenshot of this page"""
        if not filename:
            filename = f"${this.camelToSnake(className)}_{int(time.time())}.png"
        return self.driver.save_screenshot(filename)`;
  }

  /**
   * Generate Cypress Page Object
   */
  generateCypressPageObject(className, elements, sections, methods, options) {
    const elementDeclarations = elements.map(el => 
      `  get ${el.name}() {
    return cy.get('${el.selector}');
  }`
    ).join('\n\n');

    const methodImplementations = methods.map(method =>
      this.generateCypressMethod(method)
    ).join('\n\n');

    return `/**
 * ${className} - Generated by FlowScribe
 * Page Object Model for ${className.replace('Page', '')} functionality
 */
export class ${className} {
  
${elementDeclarations}

${methodImplementations}

  /**
   * Navigate to this page
   */
  goto(url) {
    const targetUrl = url || '${this.getBaseUrlPlaceholder()}';
    cy.visit(targetUrl);
    return this;
  }

  /**
   * Wait for page to be loaded
   */
  waitForLoad() {
    cy.get('body').should('be.visible');
    return this;
  }

  /**
   * Take a screenshot of this page
   */
  screenshot(filename) {
    cy.screenshot(filename || '${this.camelToKebab(className)}');
    return this;
  }
}`;
  }

  /**
   * Generate method implementations for different frameworks
   */
  generatePlaywrightMethod(method) {
    const params = method.parameters.map(p => `${p}: string`).join(', ');
    const paramList = method.parameters.join(', ');
    
    let methodBody = '';
    method.actions.forEach(action => {
      switch (action.type) {
        case 'click':
          methodBody += `    await this.${action.elementName}.click();\n`;
          break;
        case 'input':
          methodBody += `    await this.${action.elementName}.fill(${action.paramName || 'text'});\n`;
          break;
        case 'select':
          methodBody += `    await this.${action.elementName}.selectOption(${action.paramName || 'value'});\n`;
          break;
      }
    });

    return `  /**
   * ${method.description}
   */
  async ${method.name}(${params}): Promise<void> {
${methodBody}  }`;
  }

  generateSeleniumMethod(method) {
    const params = method.parameters.join(', ');
    
    let methodBody = '';
    method.actions.forEach(action => {
      switch (action.type) {
        case 'click':
          methodBody += `        self.${action.elementName}.click()\n`;
          break;
        case 'input':
          methodBody += `        self.${action.elementName}.clear()\n`;
          methodBody += `        self.${action.elementName}.send_keys(${action.paramName || 'text'})\n`;
          break;
        case 'select':
          methodBody += `        Select(self.${action.elementName}).select_by_visible_text(${action.paramName || 'value'})\n`;
          break;
      }
    });

    return `    def ${this.camelToSnake(method.name)}(self${params ? ', ' + params : ''}):
        """${method.description}"""
${methodBody}`;
  }

  generateCypressMethod(method) {
    const params = method.parameters.join(', ');
    
    let methodBody = '';
    method.actions.forEach(action => {
      switch (action.type) {
        case 'click':
          methodBody += `    this.${action.elementName}.click();\n`;
          break;
        case 'input':
          methodBody += `    this.${action.elementName}.clear().type(${action.paramName || 'text'});\n`;
          break;
        case 'select':
          methodBody += `    this.${action.elementName}.select(${action.paramName || 'value'});\n`;
          break;
      }
    });

    return `  /**
   * ${method.description}
   */
  ${method.name}(${params}) {
${methodBody}    return this;
  }`;
  }

  /**
   * Generate base page class
   */
  generateBasePageClass(framework) {
    switch (framework) {
      case 'playwright':
        return this.generatePlaywrightBasePage();
      case 'selenium':
        return this.generateSeleniumBasePage();
      case 'cypress':
        return this.generateCypressBasePage();
      default:
        return null;
    }
  }

  generatePlaywrightBasePage() {
    return {
      filename: 'base-page.ts',
      code: `import { Page } from '@playwright/test';

/**
 * BasePage - Common functionality for all Page Objects
 * Generated by FlowScribe
 */
export abstract class BasePage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Navigate to a URL
   */
  async goto(url: string): Promise<void> {
    await this.page.goto(url);
  }

  /**
   * Wait for page to load
   */
  async waitForLoad(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Get page title
   */
  async getTitle(): Promise<string> {
    return await this.page.title();
  }

  /**
   * Take screenshot
   */
  async screenshot(path?: string): Promise<Buffer> {
    return await this.page.screenshot({ path, fullPage: true });
  }

  /**
   * Wait for element to be visible
   */
  async waitForElement(selector: string, timeout = 30000): Promise<void> {
    await this.page.waitForSelector(selector, { timeout });
  }
}`
    };
  }

  /**
   * Generate test helper utilities
   */
  generateTestHelper(framework, pageObjects) {
    switch (framework) {
      case 'playwright':
        return this.generatePlaywrightTestHelper(pageObjects);
      case 'selenium':
        return this.generateSeleniumTestHelper(pageObjects);
      case 'cypress':
        return this.generateCypressTestHelper(pageObjects);
      default:
        return null;
    }
  }

  generatePlaywrightTestHelper(pageObjects) {
    const imports = pageObjects.map(po => 
      `import { ${po.className} } from './${po.filename}';`
    ).join('\n');

    const pageInstances = pageObjects.map(po => 
      `  ${this.toCamelCase(po.className)}: ${po.className};`
    ).join('\n');

    const pageInitializations = pageObjects.map(po => 
      `    this.${this.toCamelCase(po.className)} = new ${po.className}(page);`
    ).join('\n');

    return {
      filename: 'page-manager.ts',
      code: `import { Page } from '@playwright/test';
${imports}

/**
 * PageManager - Central access point for all Page Objects
 * Generated by FlowScribe
 */
export class PageManager {
  readonly page: Page;
${pageInstances}

  constructor(page: Page) {
    this.page = page;
${pageInitializations}
  }
}`
    };
  }

  /**
   * Utility methods
   */
  normalizeUrl(url) {
    try {
      const urlObj = new URL(url);
      return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
    } catch {
      return url.split('?')[0].split('#')[0];
    }
  }

  generatePageName(url) {
    const pathname = new URL(url).pathname;
    const segments = pathname.split('/').filter(s => s && s !== 'index.html');
    
    if (segments.length === 0) return 'Home';
    
    const lastSegment = segments[segments.length - 1];
    return this.toPascalCase(lastSegment.replace(/[^a-zA-Z0-9]/g, ''));
  }

  generateElementName(element) {
    // Priority order for naming
    if (element.name) return this.toCamelCase(element.name);
    if (element.id) return this.toCamelCase(element.id);
    if (element.placeholder) return this.toCamelCase(element.placeholder + 'Field');
    if (element.textContent) return this.toCamelCase(element.textContent.substring(0, 20));
    if (element.className) {
      const firstClass = element.className.split(' ')[0];
      return this.toCamelCase(firstClass);
    }
    
    return `element${Date.now()}`;
  }

  generateElementKey(element) {
    return element.selector || element.css || element.xpath || element.id || JSON.stringify(element);
  }

  determineElementType(element) {
    if (element.tagName) {
      const tag = element.tagName.toLowerCase();
      if (tag === 'input') return element.type || 'text';
      if (['button', 'a'].includes(tag)) return 'clickable';
      if (['select'].includes(tag)) return 'select';
      if (['textarea'].includes(tag)) return 'textarea';
    }
    return 'element';
  }

  determineElementSection(element) {
    // Analyze element's position and context to determine section
    const selector = element.selector || element.css || '';
    
    if (selector.includes('nav') || selector.includes('menu')) return 'navigation';
    if (selector.includes('form')) return 'form';
    if (selector.includes('modal') || selector.includes('dialog')) return 'modal';
    if (selector.includes('header')) return 'header';
    if (selector.includes('footer')) return 'footer';
    if (selector.includes('sidebar')) return 'sidebar';
    
    return 'main';
  }

  generateElementDescription(element) {
    const type = this.determineElementType(element);
    const name = element.name || element.id || 'element';
    
    if (type === 'clickable') return `${name} button/link`;
    if (type === 'text') return `${name} input field`;
    if (type === 'select') return `${name} dropdown`;
    
    return `${name} ${type}`;
  }

  generateSectionMethods(elements, sectionName) {
    // Generate methods specific to this section
    return [];
  }

  generateElementMethods(actions, framework) {
    // Generate individual element interaction methods
    return [];
  }

  generateWorkflowMethod(name, workflow, framework) {
    return {
      name,
      description: workflow.description,
      parameters: workflow.parameters,
      actions: workflow.actions.map(action => ({
        type: action.type,
        elementName: this.generateElementName(action.element || {}),
        paramName: this.inferParameterName(action)
      }))
    };
  }

  extractFormParameters(formActions) {
    return formActions
      .filter(action => action.type === 'input')
      .map(action => this.toCamelCase(action.element?.name || action.element?.id || 'value'));
  }

  inferParameterName(action) {
    if (action.element?.name) return this.toCamelCase(action.element.name);
    if (action.element?.id) return this.toCamelCase(action.element.id);
    if (action.type === 'input') return 'text';
    if (action.type === 'select') return 'value';
    return 'value';
  }

  // String utility methods
  toCamelCase(str) {
    return str.replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => {
      return index === 0 ? word.toLowerCase() : word.toUpperCase();
    }).replace(/\s+/g, '');
  }

  toPascalCase(str) {
    return str.replace(/(?:^\w|[A-Z]|\b\w)/g, (word) => {
      return word.toUpperCase();
    }).replace(/\s+/g, '');
  }

  camelToKebab(str) {
    return str.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase();
  }

  camelToSnake(str) {
    return str.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1_$2').toLowerCase();
  }

  getBaseUrlPlaceholder() {
    return '${BASE_URL}'; // Template placeholder for base URL
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PageObjectGenerator;
} else {
  window.PageObjectGenerator = PageObjectGenerator;
}