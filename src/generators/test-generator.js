/**
 * Universal Test Script Generator
 * Generates ready-to-run test scripts for multiple frameworks
 */

class TestGenerator {
  constructor() {
    this.frameworks = {
      playwright: new PlaywrightGenerator(),
      selenium: new SeleniumGenerator(),
      cypress: new CypressGenerator(),
      puppeteer: new PuppeteerGenerator()
    };
  }

  generateScript(actions, framework, options = {}) {
    const generator = this.frameworks[framework];
    if (!generator) {
      throw new Error(`Unsupported framework: ${framework}`);
    }

    return generator.generate(actions, options);
  }
}

/**
 * Base Generator Class
 */
class BaseGenerator {
  constructor() {
    this.indentSize = 2;
  }

  indent(level) {
    return ' '.repeat(this.indentSize * level);
  }

  generateWaitStrategy(action) {
    // Intelligent wait based on action context
    const waits = [];

    if (action.stateChange) {
      waits.push('element_stable');
    }

    if (action.assertions?.some(a => a.type === 'network_idle')) {
      waits.push('network_idle');
    }

    if (action.type === 'navigate') {
      waits.push('page_load');
    }

    return waits;
  }

  sanitizeString(str) {
    if (!str) return '';
    return str.replace(/'/g, "\\'").replace(/\n/g, '\\n');
  }

  generateSelector(target) {
    // Priority: data-testid > id > optimal selector
    if (target.attributes?.['data-testid']) {
      return `[data-testid="${target.attributes['data-testid']}"]`;
    }
    if (target.id) {
      return `#${target.id}`;
    }
    return target.selector || target.xpath;
  }
}

/**
 * Playwright Generator
 */
class PlaywrightGenerator extends BaseGenerator {
  generate(actions, options) {
    const {
      language = 'javascript',
      includeAssertions = true,
      includeComments = true,
      pageObjects = false,
      dataDriver = false
    } = options;

    let script = this.generateHeader(language);
    script += this.generateSetup(language);
    script += this.generateTest(actions, language, includeAssertions, includeComments);
    script += this.generateFooter(language);

    if (pageObjects) {
      script = this.wrapInPageObject(script, actions);
    }

    if (dataDriver) {
      script = this.addDataDriver(script);
    }

    return script;
  }

  generateHeader(language) {
    if (language === 'typescript') {
      return `import { test, expect, Page } from '@playwright/test';
import { readFileSync } from 'fs';

`;
    }
    return `const { test, expect } = require('@playwright/test');
const fs = require('fs');

`;
  }

  generateSetup(language) {
    return `test.describe('FlowScribe Generated Test Suite', () => {
  test.beforeEach(async ({ page }) => {
    // Set viewport
    await page.setViewportSize({ width: 1920, height: 1080 });

    // Set default timeout
    page.setDefaultTimeout(30000);

    // Wait for network idle on navigation
    page.setDefaultNavigationTimeout(30000);
  });

`;
  }

  generateTest(actions, language, includeAssertions, includeComments) {
    let script = `  test('Recorded user flow', async ({ page }) => {\n`;

    const startUrl = actions.find(a => a.url)?.url || 'https://example.com';
    script += `${this.indent(2)}// Navigate to starting page\n`;
    script += `${this.indent(2)}await page.goto('${startUrl}', { waitUntil: 'networkidle' });\n\n`;

    for (const action of actions) {
      if (includeComments && action.pageTitle) {
        script += `${this.indent(2)}// Page: ${action.pageTitle}\n`;
      }

      script += this.generateAction(action, includeAssertions);
    }

    script += `  });\n`;
    return script;
  }

  generateAction(action, includeAssertions) {
    let code = '';
    const indent = this.indent(2);

    // Use modern Playwright locator API
    const locatorCode = this.generateModernLocator(action.target);

    switch (action.type) {
      case 'click':
        // Modern: use locator().click() with auto-waiting
        code += `${indent}await ${locatorCode}.click();\n`;
        if (includeAssertions && action.assertions?.some(a => a.type === 'url_change')) {
          code += `${indent}await expect(page).toHaveURL(/.*/); // Wait for navigation\n`;
        }
        break;

      case 'double_click':
        code += `${indent}await ${locatorCode}.dblclick();\n`;
        break;

      case 'right_click':
        code += `${indent}await ${locatorCode}.click({ button: 'right' });\n`;
        break;

      case 'input':
        const value = this.sanitizeString(action.value);
        // Modern: use fill() with locator
        code += `${indent}await ${locatorCode}.fill('${value}');\n`;
        // Add assertion for non-password fields
        if (includeAssertions && action.target.type !== 'password') {
          code += `${indent}await expect(${locatorCode}).toHaveValue('${value}');\n`;
        }
        break;

      case 'change':
        if (action.target.tagName === 'select') {
          code += `${indent}await ${locatorCode}.selectOption('${action.value}');\n`;
          if (includeAssertions) {
            code += `${indent}await expect(${locatorCode}).toHaveValue('${action.value}');\n`;
          }
        } else if (action.checked !== undefined) {
          const checkMethod = action.checked ? 'check' : 'uncheck';
          code += `${indent}await ${locatorCode}.${checkMethod}();\n`;
          if (includeAssertions) {
            const assertion = action.checked ? 'toBeChecked' : 'not.toBeChecked';
            code += `${indent}await expect(${locatorCode}).${assertion}();\n`;
          }
        }
        break;

      case 'key_down':
        const key = this.mapKey(action.key);
        code += `${indent}await ${locatorCode}.press('${key}');\n`;
        break;

      case 'scroll':
        if (action.target === 'document') {
          code += `${indent}await page.evaluate(() => window.scrollTo(${action.position.x}, ${action.position.y}));\n`;
        } else {
          code += `${indent}await ${locatorCode}.scrollIntoViewIfNeeded();\n`;
        }
        break;

      case 'hover':
        code += `${indent}await ${locatorCode}.hover();\n`;
        break;

      case 'drag-drop':
        const sourceLocator = this.generateModernLocator(action.source.element);
        const targetLocator = this.generateModernLocator(action.target);
        code += `${indent}await ${sourceLocator}.dragTo(${targetLocator});\n`;
        break;

      case 'file_upload':
        const files = action.files.map(f => f.name).join(', ');
        code += `${indent}// Upload files: ${files}\n`;
        code += `${indent}await ${locatorCode}.setInputFiles(['path/to/${action.files[0].name}']);\n`;
        if (includeAssertions) {
          code += `${indent}// Verify file was uploaded\n`;
          code += `${indent}await expect(${locatorCode}).toHaveValue(/./);\n`;
        }
        break;

      case 'navigate':
        code += `${indent}await page.goto('${action.url}', { waitUntil: 'networkidle' });\n`;
        if (includeAssertions) {
          code += `${indent}await expect(page).toHaveURL('${action.url}');\n`;
        }
        break;

      case 'browser_back':
        code += `${indent}await page.goBack();\n`;
        break;

      case 'submit':
        code += `${indent}// Form submission\n`;
        code += `${indent}await ${locatorCode}.evaluate(form => form.submit());\n`;
        code += `${indent}await page.waitForLoadState('networkidle');\n`;
        if (includeAssertions) {
          code += `${indent}await expect(page).toHaveURL(/.*/); // Wait for post-submit navigation\n`;
        }
        break;
    }

    // Add assertions
    if (includeAssertions && action.assertions) {
      code += this.generateAssertions(action.assertions);
    }

    // Add wait if needed
    if (action.timeSinceLastAction > 1000) {
      code += `${indent}await page.waitForTimeout(${Math.min(action.timeSinceLastAction, 3000)}); // User think time\n`;
    }

    code += '\n';
    return code;
  }

  generateAssertions(assertions) {
    let code = '';
    const indent = this.indent(2);

    for (const assertion of assertions) {
      switch (assertion.type) {
        case 'visible':
          code += `${indent}await expect(page.locator('${assertion.selector}')).toBeVisible();\n`;
          break;
        case 'value':
          code += `${indent}await expect(page.locator('${assertion.selector}')).toHaveValue('${this.sanitizeString(assertion.value)}');\n`;
          break;
        case 'text':
          code += `${indent}await expect(page.locator('${assertion.selector}')).toContainText('${this.sanitizeString(assertion.expected)}');\n`;
          break;
        case 'attribute':
          code += `${indent}await expect(page.locator('${assertion.selector}')).toHaveAttribute('${assertion.attribute}', '${assertion.value}');\n`;
          break;
        case 'has_class':
          code += `${indent}await expect(page.locator('${assertion.selector}')).toHaveClass(/${assertion.classes.join('|')}/);\n`;
          break;
        case 'url':
          code += `${indent}await expect(page).toHaveURL(/${assertion.pattern}/);\n`;
          break;
        case 'title':
          code += `${indent}await expect(page).toHaveTitle('${this.sanitizeString(assertion.expected)}');\n`;
          break;
      }
    }

    return code;
  }

  generateFooter(language) {
    return `});
`;
  }

  mapKey(key) {
    const keyMap = {
      'Enter': 'Enter',
      'Escape': 'Escape',
      'Tab': 'Tab',
      'ArrowUp': 'ArrowUp',
      'ArrowDown': 'ArrowDown',
      'ArrowLeft': 'ArrowLeft',
      'ArrowRight': 'ArrowRight',
      ' ': 'Space'
    };
    return keyMap[key] || key;
  }

  wrapInPageObject(script, actions) {
    // Extract unique pages from actions
    const pages = this.extractPages(actions);
    let pageObjectCode = '';

    for (const [pageName, selectors] of Object.entries(pages)) {
      pageObjectCode += this.generatePageObject(pageName, selectors);
    }

    return pageObjectCode + '\n' + script;
  }

  extractPages(actions) {
    const pages = {};

    actions.forEach(action => {
      const pageName = this.getPageName(action.url || 'default');
      if (!pages[pageName]) {
        pages[pageName] = new Set();
      }
      if (action.target?.selector) {
        pages[pageName].add({
          selector: action.target.selector,
          name: this.getSelectorName(action.target)
        });
      }
    });

    return pages;
  }

  getPageName(url) {
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname.split('/').filter(Boolean);
      return path[0] || 'home';
    } catch {
      return 'page';
    }
  }

  getSelectorName(target) {
    if (target.id) return target.id;
    if (target.attributes?.['data-testid']) return target.attributes['data-testid'];
    if (target.text) return target.text.toLowerCase().replace(/\s+/g, '_');
    return 'element';
  }

  /**
   * Generate modern Playwright locator using semantic locators when possible
   * Priority: getByRole > getByLabel > getByTestId > getByText > getByPlaceholder > locator
   */
  generateModernLocator(target) {
    if (!target) return 'page.locator("body")';

    // 1. getByRole (highest priority - most semantic)
    if (target.attributes?.role) {
      const role = target.attributes.role;
      const name = target.attributes?.['aria-label'] || target.textContent;
      if (name) {
        return `page.getByRole('${role}', { name: '${this.sanitizeString(name)}' })`;
      }
      return `page.getByRole('${role}')`;
    }

    // 2. getByLabel (for form fields with labels)
    if (target.attributes?.['aria-label']) {
      return `page.getByLabel('${this.sanitizeString(target.attributes['aria-label'])}')`;
    }

    // Also check for associated <label> via for/id relationship
    if (target.id && target.tagName && ['input', 'select', 'textarea'].includes(target.tagName.toLowerCase())) {
      // This would require DOM traversal - skip for now
    }

    // 3. getByTestId (stable test identifiers)
    if (target.attributes?.['data-testid']) {
      return `page.getByTestId('${target.attributes['data-testid']}')`;
    }

    // 4. getByPlaceholder (for input fields)
    if (target.attributes?.placeholder) {
      return `page.getByPlaceholder('${this.sanitizeString(target.attributes.placeholder)}')`;
    }

    // 5. getByText (for elements with unique text)
    if (target.textContent && target.textContent.trim().length > 0 && target.textContent.trim().length < 50) {
      const text = this.sanitizeString(target.textContent.trim());
      // Use exact match for short text
      if (target.textContent.trim().length < 20) {
        return `page.getByText('${text}', { exact: true })`;
      }
      return `page.getByText('${text}')`;
    }

    // 6. getByAltText (for images)
    if (target.tagName === 'img' && target.attributes?.alt) {
      return `page.getByAltText('${this.sanitizeString(target.attributes.alt)}')`;
    }

    // 7. getByTitle
    if (target.attributes?.title) {
      return `page.getByTitle('${this.sanitizeString(target.attributes.title)}')`;
    }

    // 8. Fallback to locator with CSS selector
    const selector = this.generateSelector(target);
    return `page.locator('${selector}')`;
  }

  generatePageObject(pageName, selectors) {
    let code = `class ${this.capitalize(pageName)}Page {
  constructor(page) {
    this.page = page;\n`;

    for (const selector of selectors) {
      code += `    this.${selector.name} = page.locator('${selector.selector}');\n`;
    }

    code += `  }

  async navigate() {
    await this.page.goto('/${pageName}');
  }
}\n\n`;

    return code;
  }

  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  addDataDriver(script) {
    const dataDriverCode = `// Test Data
const testData = JSON.parse(fs.readFileSync('test-data.json', 'utf8'));

testData.forEach((data, index) => {
  test(\`Scenario \${index + 1}: \${data.scenario}\`, async ({ page }) => {
    // Use data.inputs for form values
    // Use data.expected for assertions
  });
});

`;
    return dataDriverCode + script;
  }
}

/**
 * Selenium Generator
 */
class SeleniumGenerator extends BaseGenerator {
  generate(actions, options) {
    const { language = 'java' } = options;

    switch (language) {
      case 'java':
        return this.generateJava(actions, options);
      case 'python':
        return this.generatePython(actions, options);
      case 'javascript':
        return this.generateJavaScript(actions, options);
      case 'csharp':
        return this.generateCSharp(actions, options);
      default:
        return this.generateJava(actions, options);
    }
  }

  generateJava(actions, options) {
    let script = `import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.support.ui.WebDriverWait;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.Select;
import org.openqa.selenium.interactions.Actions;
import org.openqa.selenium.JavascriptExecutor;
import org.junit.Test;
import org.junit.Before;
import org.junit.After;
import static org.junit.Assert.*;

public class FlowScribeTest {
    private WebDriver driver;
    private WebDriverWait wait;
    private Actions actions;
    private JavascriptExecutor js;

    @Before
    public void setUp() {
        System.setProperty("webdriver.chrome.driver", "path/to/chromedriver");
        driver = new ChromeDriver();
        wait = new WebDriverWait(driver, 30);
        actions = new Actions(driver);
        js = (JavascriptExecutor) driver;
        driver.manage().window().maximize();
    }

    @Test
    public void testRecordedFlow() {
`;

    const startUrl = actions.find(a => a.url)?.url || 'https://example.com';
    script += `        driver.get("${startUrl}");\n\n`;

    for (const action of actions) {
      script += this.generateJavaAction(action, options);
    }

    script += `    }

    @After
    public void tearDown() {
        if (driver != null) {
            driver.quit();
        }
    }

    private WebElement findElement(String selector) {
        if (selector.startsWith("#")) {
            return wait.until(ExpectedConditions.presenceOfElementLocated(
                By.id(selector.substring(1))
            ));
        } else if (selector.startsWith(".")) {
            return wait.until(ExpectedConditions.presenceOfElementLocated(
                By.className(selector.substring(1))
            ));
        } else if (selector.contains("[")) {
            return wait.until(ExpectedConditions.presenceOfElementLocated(
                By.cssSelector(selector)
            ));
        } else {
            return wait.until(ExpectedConditions.presenceOfElementLocated(
                By.xpath(selector)
            ));
        }
    }
}
`;

    return script;
  }

  generateJavaAction(action, options) {
    let code = '';
    const indent = '        ';

    switch (action.type) {
      case 'click':
        code += `${indent}findElement("${this.generateSelector(action.target)}").click();\n`;
        break;

      case 'input':
        code += `${indent}WebElement inputElement = findElement("${this.generateSelector(action.target)}");\n`;
        code += `${indent}inputElement.clear();\n`;
        code += `${indent}inputElement.sendKeys("${this.sanitizeString(action.value)}");\n`;
        break;

      case 'change':
        if (action.target.tagName === 'select') {
          code += `${indent}Select select = new Select(findElement("${this.generateSelector(action.target)}"));\n`;
          code += `${indent}select.selectByValue("${action.value}");\n`;
        } else if (action.checked !== undefined) {
          code += `${indent}WebElement checkbox = findElement("${this.generateSelector(action.target)}");\n`;
          code += `${indent}if (checkbox.isSelected() != ${action.checked}) {\n`;
          code += `${indent}    checkbox.click();\n`;
          code += `${indent}}\n`;
        }
        break;

      case 'scroll':
        if (action.target === 'document') {
          code += `${indent}js.executeScript("window.scrollTo(${action.position.x}, ${action.position.y})");\n`;
        } else {
          code += `${indent}WebElement element = findElement("${this.generateSelector(action.target)}");\n`;
          code += `${indent}js.executeScript("arguments[0].scrollIntoView(true);", element);\n`;
        }
        break;

      case 'hover':
        code += `${indent}actions.moveToElement(findElement("${this.generateSelector(action.target)}")).perform();\n`;
        break;

      case 'drag-drop':
        code += `${indent}WebElement source = findElement("${this.generateSelector(action.source.element)}");\n`;
        code += `${indent}WebElement target = findElement("${this.generateSelector(action.target)}");\n`;
        code += `${indent}actions.dragAndDrop(source, target).perform();\n`;
        break;
    }

    // Add assertions
    if (options.includeAssertions && action.assertions) {
      code += this.generateJavaAssertions(action.assertions);
    }

    // Add explicit wait if there's significant delay (instead of Thread.sleep)
    if (action.timeSinceLastAction > 1000) {
      const waitSeconds = Math.min(action.timeSinceLastAction / 1000, 3);
      code += `${indent}// Wait ${waitSeconds}s for page to stabilize\n`;
      code += `${indent}wait.until(ExpectedConditions.jsReturnsValue("return document.readyState === 'complete';"));\n`;
    }

    return code;
  }

  generateJavaAssertions(assertions) {
    let code = '';
    const indent = '        ';

    for (const assertion of assertions) {
      switch (assertion.type) {
        case 'visible':
          code += `${indent}assertTrue(findElement("${assertion.selector}").isDisplayed());\n`;
          break;
        case 'value':
          code += `${indent}assertEquals("${this.sanitizeString(assertion.value)}", findElement("${assertion.selector}").getAttribute("value"));\n`;
          break;
        case 'text':
          code += `${indent}assertTrue(findElement("${assertion.selector}").getText().contains("${this.sanitizeString(assertion.expected)}"));\n`;
          break;
      }
    }

    return code;
  }

  generatePython(actions, options) {
    let script = `from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.select import Select
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.keys import Keys
import time
import unittest

class FlowScribeTest(unittest.TestCase):
    def setUp(self):
        self.driver = webdriver.Chrome()
        self.wait = WebDriverWait(self.driver, 30)
        self.actions = ActionChains(self.driver)
        self.driver.maximize_window()

    def test_recorded_flow(self):
`;

    const startUrl = actions.find(a => a.url)?.url || 'https://example.com';
    script += `        self.driver.get("${startUrl}")\n\n`;

    for (const action of actions) {
      script += this.generatePythonAction(action, options);
    }

    script += `
    def tearDown(self):
        self.driver.quit()

    def find_element(self, selector):
        if selector.startswith('#'):
            return self.wait.until(EC.presence_of_element_located((By.ID, selector[1:])))
        elif selector.startswith('.'):
            return self.wait.until(EC.presence_of_element_located((By.CLASS_NAME, selector[1:])))
        elif '[' in selector:
            return self.wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, selector)))
        else:
            return self.wait.until(EC.presence_of_element_located((By.XPATH, selector)))

if __name__ == "__main__":
    unittest.main()
`;

    return script;
  }

  generatePythonAction(action, options) {
    let code = '';
    const indent = '        ';

    switch (action.type) {
      case 'click':
        code += `${indent}self.find_element("${this.generateSelector(action.target)}").click()\n`;
        break;

      case 'input':
        code += `${indent}input_element = self.find_element("${this.generateSelector(action.target)}")\n`;
        code += `${indent}input_element.clear()\n`;
        code += `${indent}input_element.send_keys("${this.sanitizeString(action.value)}")\n`;
        break;

      case 'change':
        if (action.target.tagName === 'select') {
          code += `${indent}select = Select(self.find_element("${this.generateSelector(action.target)}"))\n`;
          code += `${indent}select.select_by_value("${action.value}")\n`;
        } else if (action.checked !== undefined) {
          code += `${indent}checkbox = self.find_element("${this.generateSelector(action.target)}")\n`;
          code += `${indent}if checkbox.is_selected() != ${action.checked ? 'True' : 'False'}:\n`;
          code += `${indent}    checkbox.click()\n`;
        }
        break;

      case 'scroll':
        if (action.target === 'document') {
          code += `${indent}self.driver.execute_script("window.scrollTo(${action.position.x}, ${action.position.y})")\n`;
        } else {
          code += `${indent}element = self.find_element("${this.generateSelector(action.target)}")\n`;
          code += `${indent}self.driver.execute_script("arguments[0].scrollIntoView(true);", element)\n`;
        }
        break;

      case 'hover':
        code += `${indent}element = self.find_element("${this.generateSelector(action.target)}")\n`;
        code += `${indent}self.actions.move_to_element(element).perform()\n`;
        break;

      case 'drag-drop':
        code += `${indent}source = self.find_element("${this.generateSelector(action.source.element)}")\n`;
        code += `${indent}target = self.find_element("${this.generateSelector(action.target)}")\n`;
        code += `${indent}self.actions.drag_and_drop(source, target).perform()\n`;
        break;
    }

    // Add assertions
    if (options.includeAssertions && action.assertions) {
      code += this.generatePythonAssertions(action.assertions);
    }

    // Add explicit wait if there's significant delay (instead of time.sleep)
    if (action.timeSinceLastAction > 1000) {
      const waitSeconds = Math.min(action.timeSinceLastAction / 1000, 3);
      code += `${indent}# Wait ${waitSeconds}s for page to stabilize\n`;
      code += `${indent}self.wait.until(lambda d: d.execute_script("return document.readyState") === "complete")\n`;
    }

    return code;
  }

  generatePythonAssertions(assertions) {
    let code = '';
    const indent = '        ';

    for (const assertion of assertions) {
      switch (assertion.type) {
        case 'visible':
          code += `${indent}self.assertTrue(self.find_element("${assertion.selector}").is_displayed())\n`;
          break;
        case 'value':
          code += `${indent}self.assertEqual("${this.sanitizeString(assertion.value)}", self.find_element("${assertion.selector}").get_attribute("value"))\n`;
          break;
        case 'text':
          code += `${indent}self.assertIn("${this.sanitizeString(assertion.expected)}", self.find_element("${assertion.selector}").text)\n`;
          break;
      }
    }

    return code;
  }

  generateJavaScript(actions, options) {
    let script = `const { Builder, By, until, Key } = require('selenium-webdriver');
const assert = require('assert');

(async function testRecordedFlow() {
    let driver = await new Builder().forBrowser('chrome').build();

    try {
`;

    const startUrl = actions.find(a => a.url)?.url || 'https://example.com';
    script += `        await driver.get('${startUrl}');\n\n`;

    for (const action of actions) {
      script += this.generateJSAction(action, options);
    }

    script += `    } finally {
        await driver.quit();
    }
})();
`;

    return script;
  }

  generateJSAction(action, options) {
    let code = '';
    const indent = '        ';

    switch (action.type) {
      case 'click':
        code += `${indent}await driver.findElement(By.css('${this.generateSelector(action.target)}')).click();\n`;
        break;

      case 'input':
        code += `${indent}const inputElement = await driver.findElement(By.css('${this.generateSelector(action.target)}'));\n`;
        code += `${indent}await inputElement.clear();\n`;
        code += `${indent}await inputElement.sendKeys('${this.sanitizeString(action.value)}');\n`;
        break;

      case 'change':
        if (action.target.tagName === 'select') {
          code += `${indent}const select = await driver.findElement(By.css('${this.generateSelector(action.target)}'));\n`;
          code += `${indent}await select.findElement(By.css('option[value="${action.value}"]')).click();\n`;
        }
        break;

      case 'scroll':
        if (action.target === 'document') {
          code += `${indent}await driver.executeScript('window.scrollTo(${action.position.x}, ${action.position.y})');\n`;
        }
        break;
    }

    // Add explicit wait if there's significant delay (instead of driver.sleep)
    if (action.timeSinceLastAction > 1000) {
      const waitSeconds = Math.min(action.timeSinceLastAction / 1000, 3);
      code += `${indent}// Wait ${waitSeconds}s for page to stabilize\n`;
      code += `${indent}await driver.wait(until.elementLocated(By.css('body')), ${action.timeSinceLastAction});\n`;
    }

    return code;
  }

  generateCSharp(actions, options) {
    let script = `using System;
using OpenQA.Selenium;
using OpenQA.Selenium.Chrome;
using OpenQA.Selenium.Support.UI;
using OpenQA.Selenium.Interactions;
using NUnit.Framework;

[TestFixture]
public class FlowScribeTest
{
    private IWebDriver driver;
    private WebDriverWait wait;
    private Actions actions;
    private IJavaScriptExecutor js;

    [SetUp]
    public void SetUp()
    {
        driver = new ChromeDriver();
        wait = new WebDriverWait(driver, TimeSpan.FromSeconds(30));
        actions = new Actions(driver);
        js = (IJavaScriptExecutor)driver;
        driver.Manage().Window.Maximize();
    }

    [Test]
    public void TestRecordedFlow()
    {
`;

    const startUrl = actions.find(a => a.url)?.url || 'https://example.com';
    script += `        driver.Navigate().GoToUrl("${startUrl}");\n\n`;

    for (const action of actions) {
      script += this.generateCSharpAction(action, options);
    }

    script += `    }

    [TearDown]
    public void TearDown()
    {
        driver?.Quit();
    }

    private IWebElement FindElement(string selector)
    {
        if (selector.StartsWith("#"))
        {
            return wait.Until(SeleniumExtras.WaitHelpers.ExpectedConditions.ElementExists(
                By.Id(selector.Substring(1))
            ));
        }
        else if (selector.StartsWith("."))
        {
            return wait.Until(SeleniumExtras.WaitHelpers.ExpectedConditions.ElementExists(
                By.ClassName(selector.Substring(1))
            ));
        }
        else
        {
            return wait.Until(SeleniumExtras.WaitHelpers.ExpectedConditions.ElementExists(
                By.CssSelector(selector)
            ));
        }
    }
}
`;

    return script;
  }

  generateCSharpAction(action, options) {
    let code = '';
    const indent = '        ';

    switch (action.type) {
      case 'click':
        code += `${indent}FindElement("${this.generateSelector(action.target)}").Click();\n`;
        break;

      case 'input':
        code += `${indent}var inputElement = FindElement("${this.generateSelector(action.target)}");\n`;
        code += `${indent}inputElement.Clear();\n`;
        code += `${indent}inputElement.SendKeys("${this.sanitizeString(action.value)}");\n`;
        break;

      case 'change':
        if (action.target.tagName === 'select') {
          code += `${indent}var selectElement = FindElement("${this.generateSelector(action.target)}");\n`;
          code += `${indent}var select = new SelectElement(selectElement);\n`;
          code += `${indent}select.SelectByValue("${action.value}");\n`;
        }
        break;
    }

    // Add explicit wait if there's significant delay (instead of Thread.Sleep)
    if (action.timeSinceLastAction > 1000) {
      const waitSeconds = Math.min(action.timeSinceLastAction / 1000, 3);
      code += `${indent}// Wait ${waitSeconds}s for page to stabilize\n`;
      code += `${indent}wait.Until(d => ((IJavaScriptExecutor)d).ExecuteScript("return document.readyState").Equals("complete"));\n`;
    }

    return code;
  }
}

/**
 * Cypress Generator
 */
class CypressGenerator extends BaseGenerator {
  generate(actions, options) {
    const {
      language = 'javascript',
      includeAssertions = true,
      includeComments = true
    } = options;

    let script = this.generateHeader(language);
    script += this.generateTest(actions, includeAssertions, includeComments);
    script += this.generateFooter();

    return script;
  }

  generateHeader(language) {
    if (language === 'typescript') {
      return `/// <reference types="cypress" />

describe('FlowScribe Generated Test', () => {
`;
    }
    return `describe('FlowScribe Generated Test', () => {
`;
  }

  generateTest(actions, includeAssertions, includeComments) {
    let script = `  it('Recorded user flow', () => {\n`;

    const startUrl = actions.find(a => a.url)?.url || 'https://example.com';
    script += `    cy.visit('${startUrl}');\n`;
    script += `    cy.viewport(1920, 1080);\n\n`;

    for (const action of actions) {
      if (includeComments && action.pageTitle) {
        script += `    // Page: ${action.pageTitle}\n`;
      }

      script += this.generateAction(action, includeAssertions);
    }

    script += `  });\n`;
    return script;
  }

  generateAction(action, includeAssertions) {
    let code = '';

    switch (action.type) {
      case 'click':
        code += `    cy.get('${this.generateSelector(action.target)}').click();\n`;
        break;

      case 'double_click':
        code += `    cy.get('${this.generateSelector(action.target)}').dblclick();\n`;
        break;

      case 'right_click':
        code += `    cy.get('${this.generateSelector(action.target)}').rightclick();\n`;
        break;

      case 'input':
        code += `    cy.get('${this.generateSelector(action.target)}').clear().type('${this.sanitizeString(action.value)}');\n`;
        break;

      case 'change':
        if (action.target.tagName === 'select') {
          code += `    cy.get('${this.generateSelector(action.target)}').select('${action.value}');\n`;
        } else if (action.checked !== undefined) {
          code += `    cy.get('${this.generateSelector(action.target)}').${action.checked ? 'check' : 'uncheck'}();\n`;
        }
        break;

      case 'scroll':
        if (action.target === 'document') {
          code += `    cy.window().scrollTo(${action.position.x}, ${action.position.y});\n`;
        } else {
          code += `    cy.get('${this.generateSelector(action.target)}').scrollIntoView();\n`;
        }
        break;

      case 'hover':
        code += `    cy.get('${this.generateSelector(action.target)}').trigger('mouseover');\n`;
        break;

      case 'drag-drop':
        code += `    cy.get('${this.generateSelector(action.source.element)}').drag('${this.generateSelector(action.target)}');\n`;
        break;

      case 'file_upload':
        code += `    cy.get('${this.generateSelector(action.target)}').selectFile('path/to/${action.files[0].name}');\n`;
        break;

      case 'key_down':
        const key = this.mapCypressKey(action.key);
        code += `    cy.get('body').type('${key}');\n`;
        break;

      case 'navigate':
        code += `    cy.visit('${action.url}');\n`;
        break;

      case 'browser_back':
        code += `    cy.go('back');\n`;
        break;
    }

    // Add assertions
    if (includeAssertions && action.assertions) {
      code += this.generateCypressAssertions(action.assertions);
    }

    // Add wait
    if (action.timeSinceLastAction > 2000) {
      code += `    cy.wait(${Math.min(action.timeSinceLastAction, 3000)});\n`;
    }

    return code;
  }

  generateCypressAssertions(assertions) {
    let code = '';

    for (const assertion of assertions) {
      switch (assertion.type) {
        case 'visible':
          code += `    cy.get('${assertion.selector}').should('be.visible');\n`;
          break;
        case 'value':
          code += `    cy.get('${assertion.selector}').should('have.value', '${this.sanitizeString(assertion.value)}');\n`;
          break;
        case 'text':
          code += `    cy.get('${assertion.selector}').should('contain', '${this.sanitizeString(assertion.expected)}');\n`;
          break;
        case 'attribute':
          code += `    cy.get('${assertion.selector}').should('have.attr', '${assertion.attribute}', '${assertion.value}');\n`;
          break;
        case 'has_class':
          assertion.classes.forEach(cls => {
            code += `    cy.get('${assertion.selector}').should('have.class', '${cls}');\n`;
          });
          break;
        case 'url':
          code += `    cy.url().should('match', /${assertion.pattern}/);\n`;
          break;
        case 'title':
          code += `    cy.title().should('eq', '${this.sanitizeString(assertion.expected)}');\n`;
          break;
      }
    }

    return code;
  }

  generateFooter() {
    return `});
`;
  }

  mapCypressKey(key) {
    const keyMap = {
      'Enter': '{enter}',
      'Escape': '{esc}',
      'Tab': '{tab}',
      'ArrowUp': '{uparrow}',
      'ArrowDown': '{downarrow}',
      'ArrowLeft': '{leftarrow}',
      'ArrowRight': '{rightarrow}'
    };
    return keyMap[key] || key;
  }
}

/**
 * Puppeteer Generator
 */
class PuppeteerGenerator extends BaseGenerator {
  generate(actions, options) {
    const { includeAssertions = true, includeComments = true } = options;

    let script = this.generateHeader();
    script += this.generateTest(actions, includeAssertions, includeComments);
    script += this.generateFooter();

    return script;
  }

  generateHeader() {
    return `const puppeteer = require('puppeteer');
const assert = require('assert');

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1920, height: 1080 }
  });
  const page = await browser.newPage();

  try {
`;
  }

  generateTest(actions, includeAssertions, includeComments) {
    let script = '';

    const startUrl = actions.find(a => a.url)?.url || 'https://example.com';
    script += `    await page.goto('${startUrl}', { waitUntil: 'networkidle2' });\n\n`;

    for (const action of actions) {
      if (includeComments && action.pageTitle) {
        script += `    // Page: ${action.pageTitle}\n`;
      }

      script += this.generateAction(action, includeAssertions);
    }

    return script;
  }

  generateAction(action, includeAssertions) {
    let code = '';

    switch (action.type) {
      case 'click':
        code += `    await page.click('${this.generateSelector(action.target)}');\n`;
        if (action.assertions?.some(a => a.type === 'url_change')) {
          code += `    await page.waitForNavigation();\n`;
        }
        break;

      case 'input':
        code += `    await page.type('${this.generateSelector(action.target)}', '${this.sanitizeString(action.value)}');\n`;
        break;

      case 'change':
        if (action.target.tagName === 'select') {
          code += `    await page.select('${this.generateSelector(action.target)}', '${action.value}');\n`;
        }
        break;

      case 'scroll':
        if (action.target === 'document') {
          code += `    await page.evaluate(() => window.scrollTo(${action.position.x}, ${action.position.y}));\n`;
        }
        break;

      case 'hover':
        code += `    await page.hover('${this.generateSelector(action.target)}');\n`;
        break;

      case 'key_down':
        code += `    await page.keyboard.press('${action.key}');\n`;
        break;

      case 'file_upload':
        code += `    const input = await page.$('${this.generateSelector(action.target)}');\n`;
        code += `    await input.uploadFile('path/to/${action.files[0].name}');\n`;
        break;
    }

    // Add assertions
    if (includeAssertions && action.assertions) {
      code += this.generatePuppeteerAssertions(action.assertions);
    }

    // Add wait
    if (action.timeSinceLastAction > 1000) {
      code += `    await page.waitForTimeout(${Math.min(action.timeSinceLastAction, 3000)});\n`;
    }

    return code;
  }

  generatePuppeteerAssertions(assertions) {
    let code = '';

    for (const assertion of assertions) {
      switch (assertion.type) {
        case 'visible':
          code += `    await page.waitForSelector('${assertion.selector}', { visible: true });\n`;
          break;
        case 'value':
          code += `    const value = await page.$eval('${assertion.selector}', el => el.value);\n`;
          code += `    assert.equal(value, '${this.sanitizeString(assertion.value)}');\n`;
          break;
        case 'text':
          code += `    const text = await page.$eval('${assertion.selector}', el => el.textContent);\n`;
          code += `    assert(text.includes('${this.sanitizeString(assertion.expected)}'));\n`;
          break;
      }
    }

    return code;
  }

  generateFooter() {
    return `  } catch (error) {
    console.error('Test failed:', error);
    await page.screenshot({ path: 'error.png' });
    throw error;
  } finally {
    await browser.close();
  }
})();
`;
  }
}

// Export for use in extension
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TestGenerator;
}